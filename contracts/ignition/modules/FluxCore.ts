import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FluxCoreModule", (m) => {
  // bootstrapAdmin 用于部署初期承接 owner / admin 权限。
  // 正式环境通常会在部署完成并验收后，再把权限移交给多签或治理地址。
  const bootstrapAdmin = m.getParameter("bootstrapAdmin");

  // Pair 工厂里的 treasurySetter 是单独的角色，不一定必须和 bootstrapAdmin 相同，
  // 但如果需要在部署流程里自动调用 setTreasury，这里通常应配置成当前可签名部署账户。
  const treasurySetter = m.getParameter("treasurySetter");

  // Treasury 自身的三类关键角色：
  // multisig 负责治理和时间锁，
  // guardian 负责紧急暂停，
  // operator 负责日常白名单拨款。
  const treasuryMultisig = m.getParameter("treasuryMultisig");
  const treasuryGuardian = m.getParameter("treasuryGuardian");
  const treasuryOperator = m.getParameter("treasuryOperator");

  // 运营相关角色默认拆开，便于后续把奖励分发、回购和收入处理分给不同地址控制。
  const rewardsOperator = m.getParameter("rewardsOperator");
  const buybackOperator = m.getParameter("buybackOperator");
  const revenueOperator = m.getParameter("revenueOperator");

  // 主代币基础参数。
  const tokenName = m.getParameter("tokenName", "Flux Token");
  const tokenSymbol = m.getParameter("tokenSymbol", "FLUX");
  const initialRecipient = m.getParameter("initialRecipient");
  const initialSupply = m.getParameter("initialSupply", 0n);
  const tokenCap = m.getParameter("tokenCap", 1_000_000_000n * 10n ** 18n);

  // Treasury 时间锁最小延迟，单位为秒。
  const treasuryMinDelay = m.getParameter("treasuryMinDelay", 86_400n);

  // 收入分配参数：
  // buybackBps 表示协议收入中先拿多少比例去回购，
  // burnBps 表示回购得到的奖励代币里再拿多少比例去销毁。
  const buybackBps = m.getParameter("buybackBps", 10_000n);
  const burnBps = m.getParameter("burnBps", 0n);

  // 本地链可直接部署 MockWETH，测试网 / 主网则应传入外部已存在的 WETH 地址。
  const deployMockWeth = m.getParameter("deployMockWeth", false);

  const externalWeth = deployMockWeth ? undefined : m.getParameter("weth");
  const weth = deployMockWeth
    ? m.contract("MockWETH")
    : m.contractAt("IWETH", externalWeth!);

  // 1. 部署主代币。
  const fluxToken = m.contract("FluxToken", [
    tokenName,
    tokenSymbol,
    bootstrapAdmin,
    initialRecipient,
    initialSupply,
    tokenCap,
  ]);

  // 1.1 本地联调额外测试代币，方便前端直接扩展多币种交易与建池。
  const mockUsdt = m.contract("MockERC20", ["Tether USD", "USDT", 6], {
    id: "mockUsdt",
  });
  const mockUsdc = m.contract("MockERC20", ["USD Coin", "USDC", 6], {
    id: "mockUsdc",
  });
  const mockWbtc = m.contract("MockERC20", ["Wrapped Bitcoin", "WBTC", 8], {
    id: "mockWbtc",
  });

  // 2. 部署金库。
  const fluxTreasury = m.contract("FluxSwapTreasury", [
    treasuryMultisig,
    treasuryGuardian,
    treasuryOperator,
    treasuryMinDelay,
  ]);

  // 3. 部署 Pair 工厂。
  const fluxSwapFactory = m.contract("FluxSwapFactory", [treasurySetter]);

  // 4. 部署 Router，并绑定 Pair 工厂与 WETH。
  const fluxSwapRouter = m.contract("FluxSwapRouter", [
    fluxSwapFactory,
    weth,
  ]);

  const fluxSignedOrderSettlement = m.contract("FluxSignedOrderSettlement", [
    fluxSwapRouter,
  ]);

  // 5. 部署多池奖励管理器，奖励代币直接使用主代币。
  const fluxMultiPoolManager = m.contract("FluxMultiPoolManager", [
    bootstrapAdmin,
    fluxTreasury,
    rewardsOperator,
    fluxToken,
  ]);

  // 6. 部署池工厂，用于后续创建单币池与 LP 池。
  const fluxPoolFactory = m.contract("FluxPoolFactory", [
    bootstrapAdmin,
    fluxMultiPoolManager,
    fluxSwapFactory,
    fluxToken,
  ]);

  // 7. 部署回购执行器。
  // 默认接收地址强制设置为 Treasury，保证回购结果直接回流金库。
  const fluxBuybackExecutor = m.contract("FluxBuybackExecutor", [
    bootstrapAdmin,
    fluxTreasury,
    buybackOperator,
    fluxSwapRouter,
    fluxToken,
    fluxTreasury,
  ]);

  // 8. 部署收入分配器，接通“收入 -> 回购 -> 销毁 / 奖励分发”主链路。
  const fluxRevenueDistributor = m.contract("FluxRevenueDistributor", [
    bootstrapAdmin,
    revenueOperator,
    fluxBuybackExecutor,
    fluxMultiPoolManager,
    buybackBps,
    burnBps,
  ]);

  // 9. 基础联动：把 Pair 工厂里的协议费金库指向 Treasury。
  m.call(fluxSwapFactory, "setTreasury", [fluxTreasury], {
    id: "linkFactoryTreasury",
  });

  // 10. 基础联动：把多池管理器里的池工厂指向 PoolFactory。
  m.call(fluxMultiPoolManager, "setPoolFactory", [fluxPoolFactory], {
    id: "linkManagerPoolFactory",
  });

  return {
    weth,
    fluxToken,
    mockUsdt,
    mockUsdc,
    mockWbtc,
    fluxTreasury,
    fluxSwapFactory,
    fluxSwapRouter,
    fluxSignedOrderSettlement,
    fluxMultiPoolManager,
    fluxPoolFactory,
    fluxBuybackExecutor,
    fluxRevenueDistributor,
  };
});
