// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../libraries/SafeMath.sol";

contract FluxSwapPair is IFluxSwapPair {
    using SafeMath for uint256;

    uint256 public constant MINIMUM_LIQUIDITY = 10**3;

    address public factory;
    address public token0;
    address public token1;

    uint256 private reserve0;
    uint256 private reserve1;
    uint256 private blockTimestampLast;
    uint256 private unlocked = 1;

    uint256 public override price0CumulativeLast;
    uint256 public override price1CumulativeLast;
    uint256 public override kLast;

    bytes32 public override DOMAIN_SEPARATOR;
    bytes32 public override PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    mapping(address => uint256) public override nonces;

    modifier lock() {
        require(unlocked == 1, "FluxSwap: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FluxSwap Pair"),
                keccak256("1"),
                chainId,
                address(this)
            )
        );
    }

    function getReserves() public view override returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    function initialize(address _token0, address _token1) external override {
        require(msg.sender == factory, "FluxSwap: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "FluxSwap: TRANSFER_FAILED");
    }

    function mint(address to) external override lock returns (uint256 liquidity) {
        (uint256 r0, uint256 r1) = getReserves();
        uint256 balance0 = IFluxSwapPair(token0).balanceOf(address(this));
        uint256 balance1 = IFluxSwapPair(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - r0;
        uint256 amount1 = balance1 - r1;

        uint256 ts = totalSupply();
        if (ts == 0) {
            liquidity = SafeMath.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = SafeMath.min(
                (amount0 * ts) / r0,
                (amount1 * ts) / r1
            );
        }
        require(liquidity > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        kLast = reserve0 * reserve1;
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external override lock returns (uint256 amount0, uint256 amount1) {
        address t0 = token0;
        address t1 = token1;
        uint256 balance0 = IFluxSwapPair(t0).balanceOf(address(this));
        uint256 balance1 = IFluxSwapPair(t1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        uint256 ts = totalSupply();
        amount0 = (liquidity * balance0) / ts;
        amount1 = (liquidity * balance1) / ts;
        require(amount0 > 0 && amount1 > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        _safeTransfer(t0, to, amount0);
        _safeTransfer(t1, to, amount1);
        balance0 = IFluxSwapPair(t0).balanceOf(address(this));
        balance1 = IFluxSwapPair(t1).balanceOf(address(this));
        kLast = balance0 * balance1;
        _update(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external override lock {
        require(amount0Out > 0 || amount1Out > 0, "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint256 r0, uint256 r1) = getReserves();
        require(amount0Out < r0 && amount1Out < r1, "FluxSwap: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            address t0 = token0;
            address t1 = token1;
            require(to != t0 && to != t1, "FluxSwap: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(t0, to, amount0Out);
            if (amount1Out > 0) _safeTransfer(t1, to, amount1Out);
            balance0 = IFluxSwapPair(t0).balanceOf(address(this));
            balance1 = IFluxSwapPair(t1).balanceOf(address(this));
        }
        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "FluxSwap: INSUFFICIENT_INPUT_AMOUNT");
        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >= r0 * r1 * (1000 ** 2),
                "FluxSwap: K"
            );
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function skim(address to) external override lock {
        address t0 = token0;
        address t1 = token1;
        _safeTransfer(t0, to, IFluxSwapPair(t0).balanceOf(address(this)) - reserve0);
        _safeTransfer(t1, to, IFluxSwapPair(t1).balanceOf(address(this)) - reserve1);
    }

    function sync() external override lock {
        _update(IFluxSwapPair(token0).balanceOf(address(this)), IFluxSwapPair(token1).balanceOf(address(this)));
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        require(block.timestamp <= deadline, "FluxSwap: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner], deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "FluxSwap: INVALID_SIGNATURE");
        nonces[owner] += 1;
        _allowance[owner][spender] = value;
    }

    mapping(address => mapping(address => uint256)) private _allowance;

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowance[owner][spender];
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (from != msg.sender) {
            uint256 allowed = _allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                _allowance[from][msg.sender] = allowed - value;
            }
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint256).max && balance1 <= type(uint256).max, "FluxSwap: OVERFLOW");
        uint256 blockTimestamp = block.timestamp;
        uint256 timeElapsed = blockTimestamp - blockTimestampLast;
        if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
            price0CumulativeLast += reserve1 * timeElapsed;
            price1CumulativeLast += reserve0 * timeElapsed;
        }
        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    uint256 private _totalSupply;
    mapping(address => uint256) public override balanceOf;

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function _mint(address to, uint256 value) internal {
        _totalSupply += value;
        balanceOf[to] += value;
    }

    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        _totalSupply -= value;
    }
}
