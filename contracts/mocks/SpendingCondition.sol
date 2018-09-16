pragma solidity ^0.4.24;
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "../ParsecBridge.sol";

contract SpendingCondition {
    address constant spenderAddr = 0xF3beAC30C498D9E26865F34fCAa57dBB935b0D74;
    address constant bridgeAddr = 0x8db6B632D743aef641146DC943acb64957155388;
    
    function fulfil(bytes32 _r, bytes32 _s, uint8 _v,      // signature
        address[] _tokenAddr,                               // inputs
        address[] _receivers, uint256[] _amounts) public {  // outputs
        require(_receivers.length == _amounts.length);
        
        // check signature
        address signer = ecrecover(bytes32(ripemd160(at(this))), _v, _r, _s);
        require(signer == spenderAddr);
        
        // do transfer
        ERC20Basic token = ERC20Basic(_tokenAddr[0]);
        for (uint i = 0; i < _receivers.length; i++) {
            token.transfer(_receivers[i], _amounts[i]);
        }
    }
    
    function exitProxy(bytes32 _r, bytes32 _s, uint8 _v, bytes32[] _proof, uint _oindex) public {
        address signer = ecrecover(ripemd160(at(this)), _v, _r, _s);
        require(signer == spenderAddr);
        ParsecBridge bridge = ParsecBridge(bridgeAddr);
        bridge.startExit(_proof, _oindex);
    }

    function at(address _addr) internal view returns (bytes o_code) {
        assembly {
            // retrieve the size of the code, this needs assembly
            let size := extcodesize(_addr)
            // allocate output byte array - this could also be done without assembly
            // by using o_code = new bytes(size)
            o_code := mload(0x40)
            // new "memory end" including padding
            mstore(0x40, add(o_code, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            // store length in memory
            mstore(o_code, size)
            // actually retrieve the code, this needs assembly
            extcodecopy(_addr, add(o_code, 0x20), 0, size)
        }
    }

}