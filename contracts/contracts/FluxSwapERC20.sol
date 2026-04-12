// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Flux LP ERC20 基类
 * @notice 为 Pair LP Token 提供最小 ERC20 与 EIP-2612 Permit 能力。
 * @dev 该实现是 Pair 合约内部基类，不直接暴露额外的铸造和销毁权限给外部。
 */
contract FluxSwapERC20 {
    // LP 代币名称。
    string public constant name = "FluxSwap LP";
    // LP 代币符号。
    string public constant symbol = "FLUX-LP";
    // LP 代币精度。
    uint8 public constant decimals = 18;
    // Permit 签名结构体的类型哈希。
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    // 当前 LP 总供应量。
    uint256 public totalSupply;

    // 各地址持有的 LP 余额。
    mapping(address => uint256) public balanceOf;
    // 各持有人对 spender 的授权额度。
    mapping(address => mapping(address => uint256)) public allowance;

    // 当前链和合约地址绑定的 EIP-712 域分隔符。
    bytes32 public DOMAIN_SEPARATOR;
    // Permit 使用的账户 nonce。
    mapping(address => uint256) public nonces;

    // 授权额度变动时触发。
    event Approval(address indexed owner, address indexed spender, uint256 value);
    // LP 余额转移、铸造或销毁时触发。
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @notice 初始化域分隔符。
     * @dev 域分隔符绑定当前链 ID 和合约地址，用于 Permit 签名验证。
     */
    constructor() {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    /**
     * @notice 设置授权额度。
     * @param spender 被授权地址。
     * @param value 授权额度。
     * @return success 固定返回 `true`。
     */
    function approve(address spender, uint256 value) external returns (bool success) {
        _approve(msg.sender, spender, value);
        success = true;
    }

    /**
     * @notice 转移 LP 代币。
     * @param to 接收地址。
     * @param value 转账数量。
     * @return success 固定返回 `true`。
     */
    function transfer(address to, uint256 value) external returns (bool success) {
        _transfer(msg.sender, to, value);
        success = true;
    }

    /**
     * @notice 使用授权额度转移 LP 代币。
     * @param from 被扣款地址。
     * @param to 接收地址。
     * @param value 转账数量。
     * @return success 固定返回 `true`。
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool success) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        success = true;
    }

    /**
     * @notice 通过签名设置授权额度。
     * @param owner 持有人地址。
     * @param spender 被授权地址。
     * @param value 需要授权的额度。
     * @param deadline 签名有效截止时间。
     * @param v 签名 `v` 分量。
     * @param r 签名 `r` 分量。
     * @param s 签名 `s` 分量。
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline >= block.timestamp, "FluxSwap: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address recoveredAddress = ECDSA.recover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "FluxSwap: INVALID_SIGNATURE");
        _approve(owner, spender, value);
    }

    /**
     * @notice 铸造 LP 代币。
     * @param to 接收新铸代币的地址。
     * @param value 铸造数量。
     */
    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    /**
     * @notice 销毁 LP 代币。
     * @param from 被销毁代币的地址。
     * @param value 销毁数量。
     */
    function _burn(address from, uint256 value) internal {
        require(from != address(0), "FluxSwap: BURN_FROM_ZERO_ADDRESS");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    /**
     * @notice 写入授权额度。
     * @param owner 授权拥有者地址。
     * @param spender 被授权地址。
     * @param value 授权额度。
     */
    function _approve(address owner, address spender, uint256 value) private {
        require(owner != address(0), "FluxSwap: APPROVE_FROM_ZERO_ADDRESS");
        require(spender != address(0), "FluxSwap: APPROVE_TO_ZERO_ADDRESS");
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    /**
     * @notice 执行底层余额转移。
     * @param from 转出地址。
     * @param to 接收地址。
     * @param value 转账数量。
     */
    function _transfer(address from, address to, uint256 value) private {
        require(from != address(0), "FluxSwap: TRANSFER_FROM_ZERO_ADDRESS");
        require(to != address(0), "FluxSwap: TRANSFER_TO_ZERO_ADDRESS");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
