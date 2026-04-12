// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

/**
 * @title Flux 主代币
 * @notice 提供带总量上限、可销毁、可角色化铸币的协议主代币实现。
 * @dev 所有者默认持有管理员和铸币权限，后续可通过 `setMinter` 细分给其他模块。
 */
contract FluxToken is ERC20, ERC20Burnable, ERC20Capped, Ownable, AccessControl {
    // 允许调用 `mint` 的铸币角色标识。
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // 铸币权限发生变更时触发。
    // 参数 minter：被调整权限的地址。
    // 参数 allowed：调整后的铸币权限状态。
    event MinterUpdated(address indexed minter, bool allowed);

    // 限制只有铸币角色可以执行的函数。
    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, msg.sender), "FluxToken: FORBIDDEN");
        _;
    }

    /**
     * @notice 部署主代币，并可选铸造一笔初始供应。
     * @param _name 代币名称。
     * @param _symbol 代币符号。
     * @param _owner 初始所有者地址。
     * @param _initialRecipient 初始供应接收者地址。
     * @param _initialSupply 初始供应数量。
     * @param _cap 代币总量上限。
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _initialRecipient,
        uint256 _initialSupply,
        uint256 _cap
    ) ERC20(_name, _symbol) ERC20Capped(_cap) Ownable(_owner) {
        require(bytes(_name).length > 0, "FluxToken: INVALID_NAME");
        require(bytes(_symbol).length > 0, "FluxToken: INVALID_SYMBOL");
        require(_initialSupply <= _cap, "FluxToken: CAP_EXCEEDED");
        if (_initialSupply > 0) {
            require(_initialRecipient != address(0), "FluxToken: ZERO_ADDRESS");
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(MINTER_ROLE, _owner);
        emit MinterUpdated(_owner, true);

        if (_initialSupply > 0) {
            _mint(_initialRecipient, _initialSupply);
        }
    }

    /**
     * @notice 授予或撤销某个账户的铸币权限。
     * @param minter 待调整权限的账户地址。
     * @param allowed 为 `true` 时授予权限，为 `false` 时撤销权限。
     */
    function setMinter(address minter, bool allowed) external {
        require(msg.sender == owner(), "FluxToken: FORBIDDEN");
        require(minter != address(0), "FluxToken: ZERO_ADDRESS");

        if (allowed) {
            _grantRole(MINTER_ROLE, minter);
        } else {
            _revokeRole(MINTER_ROLE, minter);
        }

        emit MinterUpdated(minter, allowed);
    }

    /**
     * @notice 铸造新代币。
     * @param to 接收新铸代币的地址。
     * @param amount 铸造数量。
     * @return success 固定返回 `true`。
     */
    function mint(address to, uint256 amount) external onlyMinter returns (bool success) {
        require(to != address(0), "FluxToken: ZERO_ADDRESS");
        require(totalSupply() + amount <= cap(), "FluxToken: CAP_EXCEEDED");
        _mint(to, amount);
        success = true;
    }

    /**
     * @notice 转移所有权并同步管理员权限。
     * @dev 旧所有者的默认管理员和铸币权限都会被移除。
     * @param newOwner 新的所有者地址。
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxToken: ZERO_ADDRESS");
        require(newOwner != owner(), "FluxToken: SAME_OWNER");

        address previousOwner = owner();
        super.transferOwnership(newOwner);

        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        _revokeRole(MINTER_ROLE, previousOwner);
    }

    /**
     * @notice 查询某个地址当前是否拥有铸币权限。
     * @param account 待查询地址。
     * @return allowed 若具备铸币权限则返回 `true`。
     */
    function isMinter(address account) public view returns (bool allowed) {
        allowed = hasRole(MINTER_ROLE, account);
    }

    /**
     * @notice 查询接口支持情况。
     * @param interfaceId 待查询接口标识。
     * @return supported 若支持则返回 `true`。
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool supported) {
        supported = super.supportsInterface(interfaceId);
    }

    /**
     * @notice 复用 OZ 的更新流程处理转账、铸造和销毁。
     * @param from 转出地址。
     * @param to 接收地址。
     * @param value 变动数量。
     */
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Capped) {
        super._update(from, to, value);
    }
}
