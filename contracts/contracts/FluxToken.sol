// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract FluxToken is ERC20, ERC20Burnable, ERC20Capped, Ownable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event MinterUpdated(address indexed minter, bool allowed);

    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, msg.sender), "FluxToken: FORBIDDEN");
        _;
    }

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

    function isMinter(address account) public view returns (bool) {
        return hasRole(MINTER_ROLE, account);
    }

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

    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxToken: ZERO_ADDRESS");
        require(newOwner != owner(), "FluxToken: SAME_OWNER");

        address previousOwner = owner();
        super.transferOwnership(newOwner);

        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        _revokeRole(MINTER_ROLE, previousOwner);
    }

    function mint(address to, uint256 amount) external onlyMinter returns (bool) {
        require(to != address(0), "FluxToken: ZERO_ADDRESS");
        require(totalSupply() + amount <= cap(), "FluxToken: CAP_EXCEEDED");
        _mint(to, amount);
        return true;
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Capped) {
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
