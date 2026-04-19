// Code generated - DO NOT EDIT.
// This file is a generated binding and any manual changes will be lost.

package chain

import (
	"errors"
	"math/big"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
)

// Reference imports to suppress errors if they are not otherwise used.
var (
	_ = errors.New
	_ = big.NewInt
	_ = strings.NewReader
	_ = ethereum.NotFound
	_ = bind.Bind
	_ = common.Big1
	_ = types.BloomLookup
	_ = event.NewSubscription
	_ = abi.ConvertType
)

// IFluxSignedOrderSettlementSignedOrder is an auto generated low-level Go binding around an user-defined struct.
type IFluxSignedOrderSettlementSignedOrder struct {
	Maker                common.Address
	InputToken           common.Address
	OutputToken          common.Address
	AmountIn             *big.Int
	MinAmountOut         *big.Int
	MaxExecutorRewardBps *big.Int
	TriggerPriceX18      *big.Int
	Expiry               *big.Int
	Nonce                *big.Int
	Recipient            common.Address
}

// FluxSignedOrderSettlementMetaData contains all meta data concerning the FluxSignedOrderSettlement contract.
var FluxSignedOrderSettlementMetaData = &bind.MetaData{
	ABI: "[{\"inputs\":[{\"internalType\":\"address\",\"name\":\"router_\",\"type\":\"address\"}],\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"inputs\":[],\"name\":\"ECDSAInvalidSignature\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"length\",\"type\":\"uint256\"}],\"name\":\"ECDSAInvalidSignatureLength\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"s\",\"type\":\"bytes32\"}],\"name\":\"ECDSAInvalidSignatureS\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"owner\",\"type\":\"address\"}],\"name\":\"OwnableInvalidOwner\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"OwnableUnauthorizedAccount\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"ReentrancyGuardReentrantCall\",\"type\":\"error\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"bool\",\"name\":\"restricted\",\"type\":\"bool\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"executor\",\"type\":\"address\"}],\"name\":\"ExecutorPolicyUpdated\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"}],\"name\":\"NonceInvalidated\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"bytes32\",\"name\":\"orderHash\",\"type\":\"bytes32\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"executor\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"address\",\"name\":\"inputToken\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"address\",\"name\":\"outputToken\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amountIn\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"grossAmountOut\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"recipientAmountOut\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"executorFeeAmount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"address\",\"name\":\"recipient\",\"type\":\"address\"}],\"name\":\"OrderExecuted\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"previousOwner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"OwnershipTransferred\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"Paused\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"Unpaused\",\"type\":\"event\"},{\"inputs\":[],\"name\":\"DOMAIN_SEPARATOR\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"WETH\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"inputToken\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"outputToken\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amountIn\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"minAmountOut\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxExecutorRewardBps\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"triggerPriceX18\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"expiry\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"internalType\":\"address\",\"name\":\"recipient\",\"type\":\"address\"}],\"internalType\":\"structIFluxSignedOrderSettlement.SignedOrder\",\"name\":\"order\",\"type\":\"tuple\"}],\"name\":\"canExecuteOrder\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"executable\",\"type\":\"bool\"},{\"internalType\":\"string\",\"name\":\"reason\",\"type\":\"string\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"inputToken\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"outputToken\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amountIn\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"minAmountOut\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxExecutorRewardBps\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"triggerPriceX18\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"expiry\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"internalType\":\"address\",\"name\":\"recipient\",\"type\":\"address\"}],\"internalType\":\"structIFluxSignedOrderSettlement.SignedOrder\",\"name\":\"order\",\"type\":\"tuple\"},{\"internalType\":\"bytes\",\"name\":\"signature\",\"type\":\"bytes\"},{\"internalType\":\"uint256\",\"name\":\"deadline\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"executorReward\",\"type\":\"uint256\"}],\"name\":\"executeOrder\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"amountOut\",\"type\":\"uint256\"}],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"factory\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"inputToken\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"outputToken\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amountIn\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"minAmountOut\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxExecutorRewardBps\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"triggerPriceX18\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"expiry\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"internalType\":\"address\",\"name\":\"recipient\",\"type\":\"address\"}],\"internalType\":\"structIFluxSignedOrderSettlement.SignedOrder\",\"name\":\"order\",\"type\":\"tuple\"}],\"name\":\"getOrderQuote\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"amountOut\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"inputToken\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"outputToken\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amountIn\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"minAmountOut\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxExecutorRewardBps\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"triggerPriceX18\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"expiry\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"internalType\":\"address\",\"name\":\"recipient\",\"type\":\"address\"}],\"internalType\":\"structIFluxSignedOrderSettlement.SignedOrder\",\"name\":\"order\",\"type\":\"tuple\"}],\"name\":\"hashOrder\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"stateMutability\":\"pure\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"maker\",\"type\":\"address\"},{\"internalType\":\"uint256[]\",\"name\":\"nonces\",\"type\":\"uint256[]\"},{\"internalType\":\"uint256\",\"name\":\"deadline\",\"type\":\"uint256\"},{\"internalType\":\"bytes\",\"name\":\"signature\",\"type\":\"bytes\"}],\"name\":\"invalidateNoncesBySig\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"name\":\"invalidatedNonce\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"onlyRestrictedExecutor\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"name\":\"orderExecuted\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"owner\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"pause\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"paused\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"renounceOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"restrictedExecutor\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"router\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bool\",\"name\":\"restricted\",\"type\":\"bool\"}],\"name\":\"setExecutorRestriction\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"executor\",\"type\":\"address\"}],\"name\":\"setRestrictedExecutor\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"transferOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"unpause\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"stateMutability\":\"payable\",\"type\":\"receive\"}]",
}

// FluxSignedOrderSettlementABI is the input ABI used to generate the binding from.
// Deprecated: Use FluxSignedOrderSettlementMetaData.ABI instead.
var FluxSignedOrderSettlementABI = FluxSignedOrderSettlementMetaData.ABI

// FluxSignedOrderSettlement is an auto generated Go binding around an Ethereum contract.
type FluxSignedOrderSettlement struct {
	FluxSignedOrderSettlementCaller     // Read-only binding to the contract
	FluxSignedOrderSettlementTransactor // Write-only binding to the contract
	FluxSignedOrderSettlementFilterer   // Log filterer for contract events
}

// FluxSignedOrderSettlementCaller is an auto generated read-only Go binding around an Ethereum contract.
type FluxSignedOrderSettlementCaller struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// FluxSignedOrderSettlementTransactor is an auto generated write-only Go binding around an Ethereum contract.
type FluxSignedOrderSettlementTransactor struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// FluxSignedOrderSettlementFilterer is an auto generated log filtering Go binding around an Ethereum contract events.
type FluxSignedOrderSettlementFilterer struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// FluxSignedOrderSettlementSession is an auto generated Go binding around an Ethereum contract,
// with pre-set call and transact options.
type FluxSignedOrderSettlementSession struct {
	Contract     *FluxSignedOrderSettlement // Generic contract binding to set the session for
	CallOpts     bind.CallOpts              // Call options to use throughout this session
	TransactOpts bind.TransactOpts          // Transaction auth options to use throughout this session
}

// FluxSignedOrderSettlementCallerSession is an auto generated read-only Go binding around an Ethereum contract,
// with pre-set call options.
type FluxSignedOrderSettlementCallerSession struct {
	Contract *FluxSignedOrderSettlementCaller // Generic contract caller binding to set the session for
	CallOpts bind.CallOpts                    // Call options to use throughout this session
}

// FluxSignedOrderSettlementTransactorSession is an auto generated write-only Go binding around an Ethereum contract,
// with pre-set transact options.
type FluxSignedOrderSettlementTransactorSession struct {
	Contract     *FluxSignedOrderSettlementTransactor // Generic contract transactor binding to set the session for
	TransactOpts bind.TransactOpts                    // Transaction auth options to use throughout this session
}

// FluxSignedOrderSettlementRaw is an auto generated low-level Go binding around an Ethereum contract.
type FluxSignedOrderSettlementRaw struct {
	Contract *FluxSignedOrderSettlement // Generic contract binding to access the raw methods on
}

// FluxSignedOrderSettlementCallerRaw is an auto generated low-level read-only Go binding around an Ethereum contract.
type FluxSignedOrderSettlementCallerRaw struct {
	Contract *FluxSignedOrderSettlementCaller // Generic read-only contract binding to access the raw methods on
}

// FluxSignedOrderSettlementTransactorRaw is an auto generated low-level write-only Go binding around an Ethereum contract.
type FluxSignedOrderSettlementTransactorRaw struct {
	Contract *FluxSignedOrderSettlementTransactor // Generic write-only contract binding to access the raw methods on
}

// NewFluxSignedOrderSettlement creates a new instance of FluxSignedOrderSettlement, bound to a specific deployed contract.
func NewFluxSignedOrderSettlement(address common.Address, backend bind.ContractBackend) (*FluxSignedOrderSettlement, error) {
	contract, err := bindFluxSignedOrderSettlement(address, backend, backend, backend)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlement{FluxSignedOrderSettlementCaller: FluxSignedOrderSettlementCaller{contract: contract}, FluxSignedOrderSettlementTransactor: FluxSignedOrderSettlementTransactor{contract: contract}, FluxSignedOrderSettlementFilterer: FluxSignedOrderSettlementFilterer{contract: contract}}, nil
}

// NewFluxSignedOrderSettlementCaller creates a new read-only instance of FluxSignedOrderSettlement, bound to a specific deployed contract.
func NewFluxSignedOrderSettlementCaller(address common.Address, caller bind.ContractCaller) (*FluxSignedOrderSettlementCaller, error) {
	contract, err := bindFluxSignedOrderSettlement(address, caller, nil, nil)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementCaller{contract: contract}, nil
}

// NewFluxSignedOrderSettlementTransactor creates a new write-only instance of FluxSignedOrderSettlement, bound to a specific deployed contract.
func NewFluxSignedOrderSettlementTransactor(address common.Address, transactor bind.ContractTransactor) (*FluxSignedOrderSettlementTransactor, error) {
	contract, err := bindFluxSignedOrderSettlement(address, nil, transactor, nil)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementTransactor{contract: contract}, nil
}

// NewFluxSignedOrderSettlementFilterer creates a new log filterer instance of FluxSignedOrderSettlement, bound to a specific deployed contract.
func NewFluxSignedOrderSettlementFilterer(address common.Address, filterer bind.ContractFilterer) (*FluxSignedOrderSettlementFilterer, error) {
	contract, err := bindFluxSignedOrderSettlement(address, nil, nil, filterer)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementFilterer{contract: contract}, nil
}

// bindFluxSignedOrderSettlement binds a generic wrapper to an already deployed contract.
func bindFluxSignedOrderSettlement(address common.Address, caller bind.ContractCaller, transactor bind.ContractTransactor, filterer bind.ContractFilterer) (*bind.BoundContract, error) {
	parsed, err := FluxSignedOrderSettlementMetaData.GetAbi()
	if err != nil {
		return nil, err
	}
	return bind.NewBoundContract(address, *parsed, caller, transactor, filterer), nil
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _FluxSignedOrderSettlement.Contract.FluxSignedOrderSettlementCaller.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.FluxSignedOrderSettlementTransactor.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.FluxSignedOrderSettlementTransactor.contract.Transact(opts, method, params...)
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _FluxSignedOrderSettlement.Contract.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.contract.Transact(opts, method, params...)
}

// DOMAINSEPARATOR is a free data retrieval call binding the contract method 0x3644e515.
//
// Solidity: function DOMAIN_SEPARATOR() view returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) DOMAINSEPARATOR(opts *bind.CallOpts) ([32]byte, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "DOMAIN_SEPARATOR")

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// DOMAINSEPARATOR is a free data retrieval call binding the contract method 0x3644e515.
//
// Solidity: function DOMAIN_SEPARATOR() view returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) DOMAINSEPARATOR() ([32]byte, error) {
	return _FluxSignedOrderSettlement.Contract.DOMAINSEPARATOR(&_FluxSignedOrderSettlement.CallOpts)
}

// DOMAINSEPARATOR is a free data retrieval call binding the contract method 0x3644e515.
//
// Solidity: function DOMAIN_SEPARATOR() view returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) DOMAINSEPARATOR() ([32]byte, error) {
	return _FluxSignedOrderSettlement.Contract.DOMAINSEPARATOR(&_FluxSignedOrderSettlement.CallOpts)
}

// WETH is a free data retrieval call binding the contract method 0xad5c4648.
//
// Solidity: function WETH() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) WETH(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "WETH")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// WETH is a free data retrieval call binding the contract method 0xad5c4648.
//
// Solidity: function WETH() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) WETH() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.WETH(&_FluxSignedOrderSettlement.CallOpts)
}

// WETH is a free data retrieval call binding the contract method 0xad5c4648.
//
// Solidity: function WETH() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) WETH() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.WETH(&_FluxSignedOrderSettlement.CallOpts)
}

// CanExecuteOrder is a free data retrieval call binding the contract method 0xdda5ad6c.
//
// Solidity: function canExecuteOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(bool executable, string reason)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) CanExecuteOrder(opts *bind.CallOpts, order IFluxSignedOrderSettlementSignedOrder) (struct {
	Executable bool
	Reason     string
}, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "canExecuteOrder", order)

	outstruct := new(struct {
		Executable bool
		Reason     string
	})
	if err != nil {
		return *outstruct, err
	}

	outstruct.Executable = *abi.ConvertType(out[0], new(bool)).(*bool)
	outstruct.Reason = *abi.ConvertType(out[1], new(string)).(*string)

	return *outstruct, err

}

// CanExecuteOrder is a free data retrieval call binding the contract method 0xdda5ad6c.
//
// Solidity: function canExecuteOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(bool executable, string reason)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) CanExecuteOrder(order IFluxSignedOrderSettlementSignedOrder) (struct {
	Executable bool
	Reason     string
}, error) {
	return _FluxSignedOrderSettlement.Contract.CanExecuteOrder(&_FluxSignedOrderSettlement.CallOpts, order)
}

// CanExecuteOrder is a free data retrieval call binding the contract method 0xdda5ad6c.
//
// Solidity: function canExecuteOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(bool executable, string reason)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) CanExecuteOrder(order IFluxSignedOrderSettlementSignedOrder) (struct {
	Executable bool
	Reason     string
}, error) {
	return _FluxSignedOrderSettlement.Contract.CanExecuteOrder(&_FluxSignedOrderSettlement.CallOpts, order)
}

// Factory is a free data retrieval call binding the contract method 0xc45a0155.
//
// Solidity: function factory() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) Factory(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "factory")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// Factory is a free data retrieval call binding the contract method 0xc45a0155.
//
// Solidity: function factory() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Factory() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Factory(&_FluxSignedOrderSettlement.CallOpts)
}

// Factory is a free data retrieval call binding the contract method 0xc45a0155.
//
// Solidity: function factory() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) Factory() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Factory(&_FluxSignedOrderSettlement.CallOpts)
}

// GetOrderQuote is a free data retrieval call binding the contract method 0xb4bc0027.
//
// Solidity: function getOrderQuote((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) GetOrderQuote(opts *bind.CallOpts, order IFluxSignedOrderSettlementSignedOrder) (*big.Int, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "getOrderQuote", order)

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetOrderQuote is a free data retrieval call binding the contract method 0xb4bc0027.
//
// Solidity: function getOrderQuote((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) GetOrderQuote(order IFluxSignedOrderSettlementSignedOrder) (*big.Int, error) {
	return _FluxSignedOrderSettlement.Contract.GetOrderQuote(&_FluxSignedOrderSettlement.CallOpts, order)
}

// GetOrderQuote is a free data retrieval call binding the contract method 0xb4bc0027.
//
// Solidity: function getOrderQuote((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) view returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) GetOrderQuote(order IFluxSignedOrderSettlementSignedOrder) (*big.Int, error) {
	return _FluxSignedOrderSettlement.Contract.GetOrderQuote(&_FluxSignedOrderSettlement.CallOpts, order)
}

// HashOrder is a free data retrieval call binding the contract method 0x6c443b27.
//
// Solidity: function hashOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) pure returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) HashOrder(opts *bind.CallOpts, order IFluxSignedOrderSettlementSignedOrder) ([32]byte, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "hashOrder", order)

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// HashOrder is a free data retrieval call binding the contract method 0x6c443b27.
//
// Solidity: function hashOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) pure returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) HashOrder(order IFluxSignedOrderSettlementSignedOrder) ([32]byte, error) {
	return _FluxSignedOrderSettlement.Contract.HashOrder(&_FluxSignedOrderSettlement.CallOpts, order)
}

// HashOrder is a free data retrieval call binding the contract method 0x6c443b27.
//
// Solidity: function hashOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order) pure returns(bytes32)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) HashOrder(order IFluxSignedOrderSettlementSignedOrder) ([32]byte, error) {
	return _FluxSignedOrderSettlement.Contract.HashOrder(&_FluxSignedOrderSettlement.CallOpts, order)
}

// InvalidatedNonce is a free data retrieval call binding the contract method 0x8eb7e22d.
//
// Solidity: function invalidatedNonce(address , uint256 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) InvalidatedNonce(opts *bind.CallOpts, arg0 common.Address, arg1 *big.Int) (bool, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "invalidatedNonce", arg0, arg1)

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// InvalidatedNonce is a free data retrieval call binding the contract method 0x8eb7e22d.
//
// Solidity: function invalidatedNonce(address , uint256 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) InvalidatedNonce(arg0 common.Address, arg1 *big.Int) (bool, error) {
	return _FluxSignedOrderSettlement.Contract.InvalidatedNonce(&_FluxSignedOrderSettlement.CallOpts, arg0, arg1)
}

// InvalidatedNonce is a free data retrieval call binding the contract method 0x8eb7e22d.
//
// Solidity: function invalidatedNonce(address , uint256 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) InvalidatedNonce(arg0 common.Address, arg1 *big.Int) (bool, error) {
	return _FluxSignedOrderSettlement.Contract.InvalidatedNonce(&_FluxSignedOrderSettlement.CallOpts, arg0, arg1)
}

// OnlyRestrictedExecutor is a free data retrieval call binding the contract method 0x71fd15ea.
//
// Solidity: function onlyRestrictedExecutor() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) OnlyRestrictedExecutor(opts *bind.CallOpts) (bool, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "onlyRestrictedExecutor")

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// OnlyRestrictedExecutor is a free data retrieval call binding the contract method 0x71fd15ea.
//
// Solidity: function onlyRestrictedExecutor() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) OnlyRestrictedExecutor() (bool, error) {
	return _FluxSignedOrderSettlement.Contract.OnlyRestrictedExecutor(&_FluxSignedOrderSettlement.CallOpts)
}

// OnlyRestrictedExecutor is a free data retrieval call binding the contract method 0x71fd15ea.
//
// Solidity: function onlyRestrictedExecutor() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) OnlyRestrictedExecutor() (bool, error) {
	return _FluxSignedOrderSettlement.Contract.OnlyRestrictedExecutor(&_FluxSignedOrderSettlement.CallOpts)
}

// OrderExecuted is a free data retrieval call binding the contract method 0x99cd868f.
//
// Solidity: function orderExecuted(bytes32 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) OrderExecuted(opts *bind.CallOpts, arg0 [32]byte) (bool, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "orderExecuted", arg0)

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// OrderExecuted is a free data retrieval call binding the contract method 0x99cd868f.
//
// Solidity: function orderExecuted(bytes32 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) OrderExecuted(arg0 [32]byte) (bool, error) {
	return _FluxSignedOrderSettlement.Contract.OrderExecuted(&_FluxSignedOrderSettlement.CallOpts, arg0)
}

// OrderExecuted is a free data retrieval call binding the contract method 0x99cd868f.
//
// Solidity: function orderExecuted(bytes32 ) view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) OrderExecuted(arg0 [32]byte) (bool, error) {
	return _FluxSignedOrderSettlement.Contract.OrderExecuted(&_FluxSignedOrderSettlement.CallOpts, arg0)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) Owner(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "owner")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Owner() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Owner(&_FluxSignedOrderSettlement.CallOpts)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) Owner() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Owner(&_FluxSignedOrderSettlement.CallOpts)
}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) Paused(opts *bind.CallOpts) (bool, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "paused")

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Paused() (bool, error) {
	return _FluxSignedOrderSettlement.Contract.Paused(&_FluxSignedOrderSettlement.CallOpts)
}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) Paused() (bool, error) {
	return _FluxSignedOrderSettlement.Contract.Paused(&_FluxSignedOrderSettlement.CallOpts)
}

// RestrictedExecutor is a free data retrieval call binding the contract method 0xb4a6e9bf.
//
// Solidity: function restrictedExecutor() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) RestrictedExecutor(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "restrictedExecutor")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// RestrictedExecutor is a free data retrieval call binding the contract method 0xb4a6e9bf.
//
// Solidity: function restrictedExecutor() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) RestrictedExecutor() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.RestrictedExecutor(&_FluxSignedOrderSettlement.CallOpts)
}

// RestrictedExecutor is a free data retrieval call binding the contract method 0xb4a6e9bf.
//
// Solidity: function restrictedExecutor() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) RestrictedExecutor() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.RestrictedExecutor(&_FluxSignedOrderSettlement.CallOpts)
}

// Router is a free data retrieval call binding the contract method 0xf887ea40.
//
// Solidity: function router() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCaller) Router(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _FluxSignedOrderSettlement.contract.Call(opts, &out, "router")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// Router is a free data retrieval call binding the contract method 0xf887ea40.
//
// Solidity: function router() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Router() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Router(&_FluxSignedOrderSettlement.CallOpts)
}

// Router is a free data retrieval call binding the contract method 0xf887ea40.
//
// Solidity: function router() view returns(address)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementCallerSession) Router() (common.Address, error) {
	return _FluxSignedOrderSettlement.Contract.Router(&_FluxSignedOrderSettlement.CallOpts)
}

// ExecuteOrder is a paid mutator transaction binding the contract method 0xd1066c51.
//
// Solidity: function executeOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order, bytes signature, uint256 deadline, uint256 executorReward) returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) ExecuteOrder(opts *bind.TransactOpts, order IFluxSignedOrderSettlementSignedOrder, signature []byte, deadline *big.Int, executorReward *big.Int) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "executeOrder", order, signature, deadline, executorReward)
}

// ExecuteOrder is a paid mutator transaction binding the contract method 0xd1066c51.
//
// Solidity: function executeOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order, bytes signature, uint256 deadline, uint256 executorReward) returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) ExecuteOrder(order IFluxSignedOrderSettlementSignedOrder, signature []byte, deadline *big.Int, executorReward *big.Int) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.ExecuteOrder(&_FluxSignedOrderSettlement.TransactOpts, order, signature, deadline, executorReward)
}

// ExecuteOrder is a paid mutator transaction binding the contract method 0xd1066c51.
//
// Solidity: function executeOrder((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address) order, bytes signature, uint256 deadline, uint256 executorReward) returns(uint256 amountOut)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) ExecuteOrder(order IFluxSignedOrderSettlementSignedOrder, signature []byte, deadline *big.Int, executorReward *big.Int) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.ExecuteOrder(&_FluxSignedOrderSettlement.TransactOpts, order, signature, deadline, executorReward)
}

// InvalidateNoncesBySig is a paid mutator transaction binding the contract method 0x1612ef6b.
//
// Solidity: function invalidateNoncesBySig(address maker, uint256[] nonces, uint256 deadline, bytes signature) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) InvalidateNoncesBySig(opts *bind.TransactOpts, maker common.Address, nonces []*big.Int, deadline *big.Int, signature []byte) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "invalidateNoncesBySig", maker, nonces, deadline, signature)
}

// InvalidateNoncesBySig is a paid mutator transaction binding the contract method 0x1612ef6b.
//
// Solidity: function invalidateNoncesBySig(address maker, uint256[] nonces, uint256 deadline, bytes signature) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) InvalidateNoncesBySig(maker common.Address, nonces []*big.Int, deadline *big.Int, signature []byte) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.InvalidateNoncesBySig(&_FluxSignedOrderSettlement.TransactOpts, maker, nonces, deadline, signature)
}

// InvalidateNoncesBySig is a paid mutator transaction binding the contract method 0x1612ef6b.
//
// Solidity: function invalidateNoncesBySig(address maker, uint256[] nonces, uint256 deadline, bytes signature) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) InvalidateNoncesBySig(maker common.Address, nonces []*big.Int, deadline *big.Int, signature []byte) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.InvalidateNoncesBySig(&_FluxSignedOrderSettlement.TransactOpts, maker, nonces, deadline, signature)
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) Pause(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "pause")
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Pause() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Pause(&_FluxSignedOrderSettlement.TransactOpts)
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) Pause() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Pause(&_FluxSignedOrderSettlement.TransactOpts)
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) RenounceOwnership(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "renounceOwnership")
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) RenounceOwnership() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.RenounceOwnership(&_FluxSignedOrderSettlement.TransactOpts)
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) RenounceOwnership() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.RenounceOwnership(&_FluxSignedOrderSettlement.TransactOpts)
}

// SetExecutorRestriction is a paid mutator transaction binding the contract method 0x7e4b09c3.
//
// Solidity: function setExecutorRestriction(bool restricted) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) SetExecutorRestriction(opts *bind.TransactOpts, restricted bool) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "setExecutorRestriction", restricted)
}

// SetExecutorRestriction is a paid mutator transaction binding the contract method 0x7e4b09c3.
//
// Solidity: function setExecutorRestriction(bool restricted) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) SetExecutorRestriction(restricted bool) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.SetExecutorRestriction(&_FluxSignedOrderSettlement.TransactOpts, restricted)
}

// SetExecutorRestriction is a paid mutator transaction binding the contract method 0x7e4b09c3.
//
// Solidity: function setExecutorRestriction(bool restricted) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) SetExecutorRestriction(restricted bool) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.SetExecutorRestriction(&_FluxSignedOrderSettlement.TransactOpts, restricted)
}

// SetRestrictedExecutor is a paid mutator transaction binding the contract method 0x4a95237c.
//
// Solidity: function setRestrictedExecutor(address executor) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) SetRestrictedExecutor(opts *bind.TransactOpts, executor common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "setRestrictedExecutor", executor)
}

// SetRestrictedExecutor is a paid mutator transaction binding the contract method 0x4a95237c.
//
// Solidity: function setRestrictedExecutor(address executor) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) SetRestrictedExecutor(executor common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.SetRestrictedExecutor(&_FluxSignedOrderSettlement.TransactOpts, executor)
}

// SetRestrictedExecutor is a paid mutator transaction binding the contract method 0x4a95237c.
//
// Solidity: function setRestrictedExecutor(address executor) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) SetRestrictedExecutor(executor common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.SetRestrictedExecutor(&_FluxSignedOrderSettlement.TransactOpts, executor)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) TransferOwnership(opts *bind.TransactOpts, newOwner common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "transferOwnership", newOwner)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) TransferOwnership(newOwner common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.TransferOwnership(&_FluxSignedOrderSettlement.TransactOpts, newOwner)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) TransferOwnership(newOwner common.Address) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.TransferOwnership(&_FluxSignedOrderSettlement.TransactOpts, newOwner)
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) Unpause(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.Transact(opts, "unpause")
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Unpause() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Unpause(&_FluxSignedOrderSettlement.TransactOpts)
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) Unpause() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Unpause(&_FluxSignedOrderSettlement.TransactOpts)
}

// Receive is a paid mutator transaction binding the contract receive function.
//
// Solidity: receive() payable returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactor) Receive(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.contract.RawTransact(opts, nil) // calldata is disallowed for receive function
}

// Receive is a paid mutator transaction binding the contract receive function.
//
// Solidity: receive() payable returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementSession) Receive() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Receive(&_FluxSignedOrderSettlement.TransactOpts)
}

// Receive is a paid mutator transaction binding the contract receive function.
//
// Solidity: receive() payable returns()
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementTransactorSession) Receive() (*types.Transaction, error) {
	return _FluxSignedOrderSettlement.Contract.Receive(&_FluxSignedOrderSettlement.TransactOpts)
}

// FluxSignedOrderSettlementExecutorPolicyUpdatedIterator is returned from FilterExecutorPolicyUpdated and is used to iterate over the raw logs and unpacked data for ExecutorPolicyUpdated events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementExecutorPolicyUpdatedIterator struct {
	Event *FluxSignedOrderSettlementExecutorPolicyUpdated // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementExecutorPolicyUpdatedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementExecutorPolicyUpdated)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementExecutorPolicyUpdated)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementExecutorPolicyUpdatedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementExecutorPolicyUpdatedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementExecutorPolicyUpdated represents a ExecutorPolicyUpdated event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementExecutorPolicyUpdated struct {
	Restricted bool
	Executor   common.Address
	Raw        types.Log // Blockchain specific contextual infos
}

// FilterExecutorPolicyUpdated is a free log retrieval operation binding the contract event 0xdd2869661cf3bd398754d500c37928433e7d762c644a87dddac1ab603b517a7d.
//
// Solidity: event ExecutorPolicyUpdated(bool restricted, address indexed executor)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterExecutorPolicyUpdated(opts *bind.FilterOpts, executor []common.Address) (*FluxSignedOrderSettlementExecutorPolicyUpdatedIterator, error) {

	var executorRule []interface{}
	for _, executorItem := range executor {
		executorRule = append(executorRule, executorItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "ExecutorPolicyUpdated", executorRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementExecutorPolicyUpdatedIterator{contract: _FluxSignedOrderSettlement.contract, event: "ExecutorPolicyUpdated", logs: logs, sub: sub}, nil
}

// WatchExecutorPolicyUpdated is a free log subscription operation binding the contract event 0xdd2869661cf3bd398754d500c37928433e7d762c644a87dddac1ab603b517a7d.
//
// Solidity: event ExecutorPolicyUpdated(bool restricted, address indexed executor)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchExecutorPolicyUpdated(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementExecutorPolicyUpdated, executor []common.Address) (event.Subscription, error) {

	var executorRule []interface{}
	for _, executorItem := range executor {
		executorRule = append(executorRule, executorItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "ExecutorPolicyUpdated", executorRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementExecutorPolicyUpdated)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "ExecutorPolicyUpdated", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseExecutorPolicyUpdated is a log parse operation binding the contract event 0xdd2869661cf3bd398754d500c37928433e7d762c644a87dddac1ab603b517a7d.
//
// Solidity: event ExecutorPolicyUpdated(bool restricted, address indexed executor)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParseExecutorPolicyUpdated(log types.Log) (*FluxSignedOrderSettlementExecutorPolicyUpdated, error) {
	event := new(FluxSignedOrderSettlementExecutorPolicyUpdated)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "ExecutorPolicyUpdated", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// FluxSignedOrderSettlementNonceInvalidatedIterator is returned from FilterNonceInvalidated and is used to iterate over the raw logs and unpacked data for NonceInvalidated events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementNonceInvalidatedIterator struct {
	Event *FluxSignedOrderSettlementNonceInvalidated // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementNonceInvalidatedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementNonceInvalidated)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementNonceInvalidated)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementNonceInvalidatedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementNonceInvalidatedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementNonceInvalidated represents a NonceInvalidated event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementNonceInvalidated struct {
	Maker common.Address
	Nonce *big.Int
	Raw   types.Log // Blockchain specific contextual infos
}

// FilterNonceInvalidated is a free log retrieval operation binding the contract event 0x1800cd2301fbc20790ed94f3d55a28ef2306a9c31cd3c72b5b71b6e4cf5c6241.
//
// Solidity: event NonceInvalidated(address indexed maker, uint256 nonce)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterNonceInvalidated(opts *bind.FilterOpts, maker []common.Address) (*FluxSignedOrderSettlementNonceInvalidatedIterator, error) {

	var makerRule []interface{}
	for _, makerItem := range maker {
		makerRule = append(makerRule, makerItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "NonceInvalidated", makerRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementNonceInvalidatedIterator{contract: _FluxSignedOrderSettlement.contract, event: "NonceInvalidated", logs: logs, sub: sub}, nil
}

// WatchNonceInvalidated is a free log subscription operation binding the contract event 0x1800cd2301fbc20790ed94f3d55a28ef2306a9c31cd3c72b5b71b6e4cf5c6241.
//
// Solidity: event NonceInvalidated(address indexed maker, uint256 nonce)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchNonceInvalidated(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementNonceInvalidated, maker []common.Address) (event.Subscription, error) {

	var makerRule []interface{}
	for _, makerItem := range maker {
		makerRule = append(makerRule, makerItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "NonceInvalidated", makerRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementNonceInvalidated)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "NonceInvalidated", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseNonceInvalidated is a log parse operation binding the contract event 0x1800cd2301fbc20790ed94f3d55a28ef2306a9c31cd3c72b5b71b6e4cf5c6241.
//
// Solidity: event NonceInvalidated(address indexed maker, uint256 nonce)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParseNonceInvalidated(log types.Log) (*FluxSignedOrderSettlementNonceInvalidated, error) {
	event := new(FluxSignedOrderSettlementNonceInvalidated)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "NonceInvalidated", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// FluxSignedOrderSettlementOrderExecutedIterator is returned from FilterOrderExecuted and is used to iterate over the raw logs and unpacked data for OrderExecuted events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementOrderExecutedIterator struct {
	Event *FluxSignedOrderSettlementOrderExecuted // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementOrderExecutedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementOrderExecuted)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementOrderExecuted)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementOrderExecutedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementOrderExecutedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementOrderExecuted represents a OrderExecuted event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementOrderExecuted struct {
	OrderHash          [32]byte
	Maker              common.Address
	Executor           common.Address
	InputToken         common.Address
	OutputToken        common.Address
	AmountIn           *big.Int
	GrossAmountOut     *big.Int
	RecipientAmountOut *big.Int
	ExecutorFeeAmount  *big.Int
	Recipient          common.Address
	Raw                types.Log // Blockchain specific contextual infos
}

// FilterOrderExecuted is a free log retrieval operation binding the contract event 0x12bbfe84409c2022d3c1fcffae08d954f3089919523137fd0d283b901182f557.
//
// Solidity: event OrderExecuted(bytes32 indexed orderHash, address indexed maker, address indexed executor, address inputToken, address outputToken, uint256 amountIn, uint256 grossAmountOut, uint256 recipientAmountOut, uint256 executorFeeAmount, address recipient)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterOrderExecuted(opts *bind.FilterOpts, orderHash [][32]byte, maker []common.Address, executor []common.Address) (*FluxSignedOrderSettlementOrderExecutedIterator, error) {

	var orderHashRule []interface{}
	for _, orderHashItem := range orderHash {
		orderHashRule = append(orderHashRule, orderHashItem)
	}
	var makerRule []interface{}
	for _, makerItem := range maker {
		makerRule = append(makerRule, makerItem)
	}
	var executorRule []interface{}
	for _, executorItem := range executor {
		executorRule = append(executorRule, executorItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "OrderExecuted", orderHashRule, makerRule, executorRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementOrderExecutedIterator{contract: _FluxSignedOrderSettlement.contract, event: "OrderExecuted", logs: logs, sub: sub}, nil
}

// WatchOrderExecuted is a free log subscription operation binding the contract event 0x12bbfe84409c2022d3c1fcffae08d954f3089919523137fd0d283b901182f557.
//
// Solidity: event OrderExecuted(bytes32 indexed orderHash, address indexed maker, address indexed executor, address inputToken, address outputToken, uint256 amountIn, uint256 grossAmountOut, uint256 recipientAmountOut, uint256 executorFeeAmount, address recipient)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchOrderExecuted(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementOrderExecuted, orderHash [][32]byte, maker []common.Address, executor []common.Address) (event.Subscription, error) {

	var orderHashRule []interface{}
	for _, orderHashItem := range orderHash {
		orderHashRule = append(orderHashRule, orderHashItem)
	}
	var makerRule []interface{}
	for _, makerItem := range maker {
		makerRule = append(makerRule, makerItem)
	}
	var executorRule []interface{}
	for _, executorItem := range executor {
		executorRule = append(executorRule, executorItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "OrderExecuted", orderHashRule, makerRule, executorRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementOrderExecuted)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "OrderExecuted", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseOrderExecuted is a log parse operation binding the contract event 0x12bbfe84409c2022d3c1fcffae08d954f3089919523137fd0d283b901182f557.
//
// Solidity: event OrderExecuted(bytes32 indexed orderHash, address indexed maker, address indexed executor, address inputToken, address outputToken, uint256 amountIn, uint256 grossAmountOut, uint256 recipientAmountOut, uint256 executorFeeAmount, address recipient)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParseOrderExecuted(log types.Log) (*FluxSignedOrderSettlementOrderExecuted, error) {
	event := new(FluxSignedOrderSettlementOrderExecuted)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "OrderExecuted", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// FluxSignedOrderSettlementOwnershipTransferredIterator is returned from FilterOwnershipTransferred and is used to iterate over the raw logs and unpacked data for OwnershipTransferred events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementOwnershipTransferredIterator struct {
	Event *FluxSignedOrderSettlementOwnershipTransferred // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementOwnershipTransferredIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementOwnershipTransferred)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementOwnershipTransferred)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementOwnershipTransferredIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementOwnershipTransferredIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementOwnershipTransferred represents a OwnershipTransferred event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementOwnershipTransferred struct {
	PreviousOwner common.Address
	NewOwner      common.Address
	Raw           types.Log // Blockchain specific contextual infos
}

// FilterOwnershipTransferred is a free log retrieval operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterOwnershipTransferred(opts *bind.FilterOpts, previousOwner []common.Address, newOwner []common.Address) (*FluxSignedOrderSettlementOwnershipTransferredIterator, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "OwnershipTransferred", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementOwnershipTransferredIterator{contract: _FluxSignedOrderSettlement.contract, event: "OwnershipTransferred", logs: logs, sub: sub}, nil
}

// WatchOwnershipTransferred is a free log subscription operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchOwnershipTransferred(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementOwnershipTransferred, previousOwner []common.Address, newOwner []common.Address) (event.Subscription, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "OwnershipTransferred", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementOwnershipTransferred)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "OwnershipTransferred", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseOwnershipTransferred is a log parse operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParseOwnershipTransferred(log types.Log) (*FluxSignedOrderSettlementOwnershipTransferred, error) {
	event := new(FluxSignedOrderSettlementOwnershipTransferred)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "OwnershipTransferred", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// FluxSignedOrderSettlementPausedIterator is returned from FilterPaused and is used to iterate over the raw logs and unpacked data for Paused events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementPausedIterator struct {
	Event *FluxSignedOrderSettlementPaused // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementPausedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementPaused)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementPaused)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementPausedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementPausedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementPaused represents a Paused event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementPaused struct {
	Account common.Address
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterPaused is a free log retrieval operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterPaused(opts *bind.FilterOpts, account []common.Address) (*FluxSignedOrderSettlementPausedIterator, error) {

	var accountRule []interface{}
	for _, accountItem := range account {
		accountRule = append(accountRule, accountItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "Paused", accountRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementPausedIterator{contract: _FluxSignedOrderSettlement.contract, event: "Paused", logs: logs, sub: sub}, nil
}

// WatchPaused is a free log subscription operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchPaused(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementPaused, account []common.Address) (event.Subscription, error) {

	var accountRule []interface{}
	for _, accountItem := range account {
		accountRule = append(accountRule, accountItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "Paused", accountRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementPaused)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "Paused", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParsePaused is a log parse operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParsePaused(log types.Log) (*FluxSignedOrderSettlementPaused, error) {
	event := new(FluxSignedOrderSettlementPaused)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "Paused", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// FluxSignedOrderSettlementUnpausedIterator is returned from FilterUnpaused and is used to iterate over the raw logs and unpacked data for Unpaused events raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementUnpausedIterator struct {
	Event *FluxSignedOrderSettlementUnpaused // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *FluxSignedOrderSettlementUnpausedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(FluxSignedOrderSettlementUnpaused)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(FluxSignedOrderSettlementUnpaused)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *FluxSignedOrderSettlementUnpausedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *FluxSignedOrderSettlementUnpausedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// FluxSignedOrderSettlementUnpaused represents a Unpaused event raised by the FluxSignedOrderSettlement contract.
type FluxSignedOrderSettlementUnpaused struct {
	Account common.Address
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterUnpaused is a free log retrieval operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) FilterUnpaused(opts *bind.FilterOpts, account []common.Address) (*FluxSignedOrderSettlementUnpausedIterator, error) {

	var accountRule []interface{}
	for _, accountItem := range account {
		accountRule = append(accountRule, accountItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.FilterLogs(opts, "Unpaused", accountRule)
	if err != nil {
		return nil, err
	}
	return &FluxSignedOrderSettlementUnpausedIterator{contract: _FluxSignedOrderSettlement.contract, event: "Unpaused", logs: logs, sub: sub}, nil
}

// WatchUnpaused is a free log subscription operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) WatchUnpaused(opts *bind.WatchOpts, sink chan<- *FluxSignedOrderSettlementUnpaused, account []common.Address) (event.Subscription, error) {

	var accountRule []interface{}
	for _, accountItem := range account {
		accountRule = append(accountRule, accountItem)
	}

	logs, sub, err := _FluxSignedOrderSettlement.contract.WatchLogs(opts, "Unpaused", accountRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(FluxSignedOrderSettlementUnpaused)
				if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "Unpaused", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseUnpaused is a log parse operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address indexed account)
func (_FluxSignedOrderSettlement *FluxSignedOrderSettlementFilterer) ParseUnpaused(log types.Log) (*FluxSignedOrderSettlementUnpaused, error) {
	event := new(FluxSignedOrderSettlementUnpaused)
	if err := _FluxSignedOrderSettlement.contract.UnpackLog(event, "Unpaused", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}
