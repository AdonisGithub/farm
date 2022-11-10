const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const EthCrypto = require("eth-crypto");
const keccak256 = require("keccak256");
const { delay, toBigNum, fromBigNum } = require("./utils.js");

var ERC20ABI = artifacts.readArtifactSync("contracts/Mock/FakeUsdc.sol:IERC20").abi;
var pairContract;
var exchangeRouter;
var exchangeFactory;
let wBNB;

let token;
let stakingPool;

var furFi_bnb_lp;

var owner;
var user1;
var user2;

var isOnchain = false; //true: bsc testnet, false: hardhat net

var deployedAddress = {
  exchangeFactory: "0xb7926c0430afb07aa7defde6da862ae0bde767bc",
  wBNB: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  exchangeRouter: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
  token: "0xA3ae030037d2A34875FcA27b79a0f6F014D9F68F",
  stakingPool: "0x96AAEFCb181BdBb50DD9c152dDf695960F42BAf0",
};

var lpAddresses = {
    furFi_bnb_lp: "0x2BedaE042B02F454dEDB6010c3f9478ebCe233ef"
};

/**
 *  _admin: owner.address
 *  _developmentFounders = 0xC01cbc79644283782BabE262D1C56493d83D6fe2
    _advisors = 0x105F706AB60fcc1F760b1b6cAD331A647272BDCb
    _marketingReservesPool = 0x56edb7B2AB826B64c26C599C050B909c4d8E1a29
    _devTeam = 0x4962B860e02eb883CB02Bd879641f3d637e123fC
 */


describe("Create Account and wallet", () => {
  it("Create Wallet", async () => {
    [owner, user1, user2] = await ethers.getSigners();
    console.log("owner", owner.address);
    console.log("user1", user1.address);
    console.log("user2", user2.address);

  });
});

describe("Contracts deploy", () => {
 // ------ dex deployment ------- //
  it("Factory deploy", async () => {
    const Factory = await ethers.getContractFactory("PancakeFactory");
    if (!isOnchain) {
      exchangeFactory = await Factory.deploy(owner.address);
      await exchangeFactory.deployed();
      console.log(await exchangeFactory.INIT_CODE_PAIR_HASH());
    } else {
      exchangeFactory = Factory.attach(deployedAddress.exchangeFactory);
    }
    console.log("Factory", exchangeFactory.address);
  });

  it("WBNB deploy", async () => {
    const WBNB_ = await ethers.getContractFactory("WBNB");
    if (!isOnchain) {
      wBNB = await WBNB_.deploy();
      await wBNB.deployed();
    } else {
      wBNB = WBNB_.attach(deployedAddress.wBNB);
    }
    console.log("WBNB", wBNB.address);
  });

  it("Router deploy", async () => {
    const Router = await ethers.getContractFactory("PancakeRouter");
    if (!isOnchain) {
      exchangeRouter = await Router.deploy(
        exchangeFactory.address,
        wBNB.address
      );
      await exchangeRouter.deployed();
    } else {
      exchangeRouter = Router.attach(deployedAddress.exchangeRouter);
    }
    console.log("Router", exchangeRouter.address);
  });

  it("Token deploy", async () => {
    Token = await ethers.getContractFactory("FurioFinanceToken");
    if (!isOnchain) {
      token = await upgrades.deployProxy(Token, ["FurioFinanceToken", "$FURFI", toBigNum("10000000", 18), owner.address, "0xC01cbc79644283782BabE262D1C56493d83D6fe2", "0x105F706AB60fcc1F760b1b6cAD331A647272BDCb", "0x56edb7B2AB826B64c26C599C050B909c4d8E1a29", "0x4962B860e02eb883CB02Bd879641f3d637e123fC"]);
      await token.deployed();
    }
    else{
      token = Token.attach(deployedAddress.token);
    }
    console.log("token", token.address);
  });

  it("creat BNB-FurFiToken pool", async () => {
    if (!isOnchain) {
      var tx = await token.approve(
        exchangeRouter.address,
        toBigNum("5000000", 18)
      );
      await tx.wait();

      var tx = await exchangeRouter.addLiquidityETH(
        token.address,
        toBigNum("5000000", 18),
        0,
        0,
        owner.address,
        "1234325432314321",
        { value: ethers.utils.parseUnits("0.5", 18) }
      );
      await tx.wait();

      var pair = await exchangeFactory.getPair(wBNB.address, token.address);
      furFi_bnb_lp = new ethers.Contract(pair, ERC20ABI, owner);
      console.log("furFi_bnb_lp address", furFi_bnb_lp.address);
    } else {
      console.log("furFi_bnb_lp address", lpAddresses.furFi_bnb_lp);
    }
  });

  it("StakingPool contract deployment, set role", async () => {
    StakingPool = await ethers.getContractFactory("StakingPool");
    if (!isOnchain) {
      //for hardhat test
      stakingPool = await upgrades.deployProxy(StakingPool, [
        token.address,
        furFi_bnb_lp.address,
        exchangeRouter.address,
        owner.address,
      ]);
      await stakingPool.deployed();

      //**** when deploy on testnet, run one time!  ****//
      // stakingPool = await upgrades.deployProxy(StakingPool, [
      //   token.address,
      //   lpAddresses.furFi_bnb_lp,
      //   exchangeRouter.address,
      //   owner.address,
      // ]);
      // await stakingPool.deployed();

      //set role
      var tx = await stakingPool.grantRole(
        keccak256("UPDATER_ROLE"),
        owner.address
      );
      await tx.wait();
      var tx = await stakingPool.grantRole(
        keccak256("PAUSER_ROLE"),
        owner.address
      );
      await tx.wait();

      //set setFurFiMintingRewards
      var currentTimeStamp = (await ethers.provider.getBlock("latest")).timestamp;
      console.log("current timestamp", currentTimeStamp);
      var tx = await stakingPool.setFurFiMintingRewards(
        currentTimeStamp + 2592000,
        currentTimeStamp + 7776000,
        toBigNum("100000"),
        toBigNum("10000")
      )
      await tx.wait();

      //FurFi Token
      var tx = await token.grantRole(
        keccak256("MINTER_ROLE"),
        stakingPool.address
      );
      await tx.wait();

    } else {
      stakingPool = StakingPool.attach(deployedAddress.stakingPool);
    }
    console.log("stakingPool", stakingPool.address);
  });

});

/////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////     test  ///////////////////////////////////////////////////

describe("test ", () => {
  
    it("user1 stake 1000 FURFI", async () => {
        var tx = await token.transfer(user1.address, toBigNum("1000"));
        await tx.wait();

        var tx = await token.connect(user1).approve(stakingPool.address, toBigNum("1000"));
        await tx.wait();

        var tx = await stakingPool.connect(user1).stake(toBigNum("1000"));
        await tx.wait();

        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

    })

    it("user2 stake 2000 FURFI", async () => {
      var tx = await token.transfer(user2.address, toBigNum("2000"));
      await tx.wait();

      var tx = await token.connect(user2).approve(stakingPool.address, toBigNum("2000"));
      await tx.wait();

      var tx = await stakingPool.connect(user2).stake(toBigNum("2000"));
      await tx.wait();
  })

  it("check pending FurFi rewards", async () => {
    let user1PendingFurFiReward = await stakingPool.getPendingFurFiRewards(user1.address);
    console.log("user1PendingFurFiReward", fromBigNum(user1PendingFurFiReward));
    let user2PendingFurFiReward = await stakingPool.getPendingFurFiRewards(user2.address);
    console.log("user1PendingFurFiReward", fromBigNum(user2PendingFurFiReward));
  })

  it("user1 unstake", async () => {
    var tx = await stakingPool.connect(user1).unstake(toBigNum("1000"));
    await tx.wait();
    await checkTokenBalance();
  })

  it("user1 claim reward", async () => {
    var tx = await stakingPool.connect(user1).claimLpTokens(toBigNum("0"), toBigNum("400000"), user1.address);
    await tx.wait();
    await checkTokenBalance();
  })

});
/////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkBNBBalance = async () =>{
    console.log("owner wBNB balance", fromBigNum(await ethers.provider.getBalance(owner.address), 18));
    console.log("user1 wBNB balance", fromBigNum(await ethers.provider.getBalance(user1.address), 18));
    console.log("user2 wBNB balance", fromBigNum(await ethers.provider.getBalance(user2.address), 18));
  }
  
  const checkTokenBalance = async () =>{
    console.log("owner Token balance", fromBigNum(await token.balanceOf(owner.address), 18));
    console.log("user1 Token balance", fromBigNum(await token.balanceOf(user1.address), 18));
    console.log("user2 Token balance", fromBigNum(await token.balanceOf(user2.address), 18));
  }