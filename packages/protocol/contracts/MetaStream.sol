pragma solidity =0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


import "./Sablier.sol";
import "./interfaces/ISablier.sol";

/**
 * @title Sablier
 * @author Ameen Soleimani
 * @notice Meta Money streaming.
 */

contract MetaStream is ERC20 {
    using SafeERC20 for IERC20;

    /*** Storage Properties ***/

    address public owner;
    address public sablier;
    uint256 public streamId;
    
    address public recipient;
    address public tokenAddress;
    uint256 public startTime;
    uint256 public stopTime;

    address public thisContract;


    uint256 public _tokensToBurn;
    uint256 public _forkDepositAdjusted;

    constructor(address _owner, address _sablier) public {
        /*
        1. save sablier contract address
        2. create metatoken for stream
        */ 

        owner = _owner;
        sablier = _sablier;
        _mint(msg.sender, 100);
        thisContract = address(this);
    }

    function createStream(address _recipient, uint256 deposit, address _tokenAddress, uint256 _startTime, uint256 _stopTime) public {
        require(streamId == 0, 'one stream per metastream');
        recipient = _recipient;
        tokenAddress = _tokenAddress;
        startTime = _startTime;
        stopTime = _stopTime;
        IERC20(tokenAddress).safeTransferFrom(owner, address(this), deposit);
        IERC20(tokenAddress).approve(sablier, deposit);
        streamId = ISablier(sablier).createStream(recipient, deposit, tokenAddress, startTime, stopTime);
    }

    function cancelStream() public {
        require(msg.sender == owner, 'only owner is allowed to cancel metastream');
        ISablier(sablier).cancelStream(streamId);
        uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
        IERC20(tokenAddress).safeTransfer(owner, balance);
    }

    function withdrawTokens() public {
        uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
        IERC20(tokenAddress).safeTransfer(owner, balance);
    }

    function splitStream(address newRecipient, uint256 tokensToBurn) public {
        _tokensToBurn = tokensToBurn;
        require(balanceOf(msg.sender) >= tokensToBurn);
        this.transferFrom(msg.sender, address(this), tokensToBurn);

        ISablier(sablier).cancelStream(streamId);
        uint256 balance = IERC20(tokenAddress).balanceOf(address(this));
        IERC20(tokenAddress).approve(sablier, balance);

        uint256 forkDeposit = tokensToBurn * balance / this.totalSupply();
        uint256 forkDepositAdjusted = forkDeposit * startTime / startTime;

        uint256 mainDeposit = balance - forkDepositAdjusted;
        uint256 mainDepositAdjusted = mainDeposit * startTime / startTime;

        // create a forked stream
        ISablier(sablier).createStream(newRecipient, forkDepositAdjusted, tokenAddress, startTime, stopTime);

        // re-create the main stream
        streamId = ISablier(sablier).createStream(recipient, mainDepositAdjusted, tokenAddress, startTime, stopTime);

        /*
        1. transferFrom metatokens to this address
        2. cancel initial stream
        3. compute amount of tokens to split
        4. create main stream and the split stream
        5. if split again, only main stream should be split again
        */
    }
}