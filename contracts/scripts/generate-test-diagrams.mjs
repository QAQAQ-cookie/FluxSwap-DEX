import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.resolve(scriptDir, "..");
const integrationDir = path.join(contractsRoot, "test", "regular", "integration", "assets");
const regressionDir = path.join(contractsRoot, "test", "regular", "regression", "assets");

fs.mkdirSync(integrationDir, { recursive: true });
fs.mkdirSync(regressionDir, { recursive: true });

const palettes = {
  blue: { shell: "#EAF1FF", border: "#C9D9FF", badge: "#4B73F2", text: "#2142A8", rule: "#D8E5FF" },
  teal: { shell: "#EAF8F4", border: "#BFE8DE", badge: "#179986", text: "#0F6258", rule: "#CFEFE8" },
  amber: { shell: "#FFF5E3", border: "#F2D49C", badge: "#DA9400", text: "#9A6100", rule: "#F7E4BF" },
  coral: { shell: "#FFF0EC", border: "#F4C1B5", badge: "#E46644", text: "#B34A2E", rule: "#F7D5CD" },
  slate: { shell: "#EEF3F8", border: "#CAD6E4", badge: "#647891", text: "#2F425A", rule: "#DDE5EF" },
};

const diagrams = [
  {
    dir: integrationDir,
    file: "amm-core-flow.svg",
    title: "FluxAmmCoreFlow",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "创建 Pair\n并注入流动性", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "执行 Swap", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "协议费沉淀到\nTreasury", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "Treasury\n放款", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "LP 退出\n流动性", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: integrationDir,
    file: "eth-weth-flow.svg",
    title: "FluxEthWethFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "添加 ETH / WETH\n流动性", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "执行 ETH 与 Token\n互换", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "协议费记入\nTreasury", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "链路完成\n并结算", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "multi-hop-routing-flow.svg",
    title: "FluxMultiHopRoutingFlow",
    width: 1120,
    height: 340,
    nodes: [
      { id: "A", label: "创建 A-B 与 B-C\n两个 Pair", x: 40, y: 135, tone: "blue" },
      { id: "B", label: "执行 A -> B -> C\n多跳 Swap", x: 280, y: 135, tone: "teal" },
      { id: "C", label: "第一跳输入资产\n计费", x: 540, y: 55, tone: "amber" },
      { id: "D", label: "第二跳输入资产\n计费", x: 540, y: 215, tone: "coral" },
      { id: "E", label: "协议费进入\nTreasury", x: 820, y: 135, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["B", "D"], ["C", "E"], ["D", "E"]],
  },
  {
    dir: integrationDir,
    file: "exact-output-routing-flow.svg",
    title: "FluxExactOutputRoutingFlow",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "给定\n目标输出", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "Router 反推\n输入金额", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "执行多跳\nExact Output Swap", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "两跳输入资产\n分别计费", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "Treasury\n收到协议费", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: integrationDir,
    file: "exact-output-eth-flow.svg",
    title: "FluxExactOutputEthFlow",
    width: 980,
    height: 340,
    nodes: [
      { id: "A", label: "准备 Token-ETH\n流动性", x: 50, y: 135, tone: "blue" },
      { id: "B", label: "执行 Exact Output\nToken -> ETH", x: 320, y: 55, tone: "teal" },
      { id: "C", label: "执行 Exact Output\nETH -> Token", x: 320, y: 215, tone: "teal" },
      { id: "D", label: "协议费记在\nToken", x: 640, y: 55, tone: "amber" },
      { id: "E", label: "协议费记在\nWETH", x: 640, y: 215, tone: "coral" },
    ],
    edges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "E"]],
  },
  {
    dir: integrationDir,
    file: "fee-on-transfer-routing-flow.svg",
    title: "FluxFeeOnTransferRoutingFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "Fee-on-Transfer\nToken 入场", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "Pair 实际收到\n净输入", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Router\n完成 Swap", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "Treasury 按\n净输入记费", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "flash-swap-flow.svg",
    title: "FluxFlashSwapFlow",
    width: 1140,
    height: 360,
    nodes: [
      { id: "A", label: "Pair\n借出资产", x: 40, y: 145, tone: "blue" },
      { id: "B", label: "回调\n执行", x: 270, y: 145, tone: "teal" },
      { id: "C", label: "归还本金\n+ 手续费", x: 500, y: 65, tone: "amber" },
      { id: "D", label: "Treasury\n收到协议费", x: 760, y: 65, tone: "slate" },
      { id: "E", label: "只归还\n本金", x: 500, y: 225, tone: "coral" },
      { id: "F", label: "交易\n回滚", x: 760, y: 225, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["B", "E"], ["E", "F"]],
  },
  {
    dir: integrationDir,
    file: "permit-liquidity-flow.svg",
    title: "FluxPermitLiquidityFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "LP\n持有仓位", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "链下签署\nPermit", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Router 携签名\n移除流动性", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "收到 Token / ETH\n资产", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "protocol-flow.svg",
    title: "FluxProtocolFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "Treasury\n配置奖励资金", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "用户\n质押", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Staking Pool\n记入奖励", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "用户退出领取\n本金与奖励", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "revenue-distributor-flow.svg",
    title: "FluxRevenueDistributorFlow",
    width: 1280,
    height: 360,
    nodes: [
      { id: "A", label: "Treasury 持有\n收入资产", x: 40, y: 145, tone: "blue" },
      { id: "B", label: "RevenueDistributor\n分流", x: 280, y: 145, tone: "teal" },
      { id: "C", label: "BuybackExecutor\n回购 FLUX", x: 520, y: 55, tone: "amber" },
      { id: "D", label: "Burn + Manager\n分发", x: 780, y: 55, tone: "coral" },
      { id: "E", label: "直发 Treasury\nFLUX 奖励", x: 520, y: 235, tone: "amber" },
      { id: "F", label: "Staker 最终\n领取奖励", x: 1040, y: 145, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "F"], ["B", "E"], ["E", "F"]],
  },
  {
    dir: integrationDir,
    file: "treasury-operations-flow.svg",
    title: "FluxTreasuryOperationsFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "Treasury 完成\n白名单与额度配置", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "执行 Native / Token\n支出", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Approved Spender\nPull / Burn", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "Timelock\nEmergency Withdraw", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "single-pool-factory-flow.svg",
    title: "FluxSinglePoolFactoryFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "PoolFactory\n创建单币池", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "用户\n质押", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Treasury -> Manager\n-> Pool 发奖", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "用户退出领取\n本金与奖励", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "lp-mining-flow.svg",
    title: "FluxLpMiningFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "创建 LP\n仓位", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "LP Token\n进入挖矿池", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "Manager\n分发奖励", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "LP 用户退出领取\n本金与奖励", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "multi-pool-allocation-flow.svg",
    title: "FluxMultiPoolAllocationFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "创建多个\nPool", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "Manager 按 allocPoint\n分发奖励", x: 300, y: 120, tone: "teal" },
      { id: "C", label: "停用其中一个\nPool", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "后续奖励仅流向\n活跃 Pool", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: integrationDir,
    file: "managed-pool-lifecycle-flow.svg",
    title: "FluxManagedPoolLifecycleFlow",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "创建 Managed\nPool", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "用户质押\n并运行", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "交接 Pool\n所有权", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "旧池用户\n安全退出", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "同资产重建\nReplacement Pool", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: integrationDir,
    file: "managed-pool-reward-config-flow.svg",
    title: "FluxManagedPoolRewardConfigurationFlow",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "初始为 Manager\nSync 模式", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "同步并计入\n旧奖励", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "切换到 Treasury\nNotify 模式", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "继续发放\n新奖励", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "用户退出\n统一结算", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: integrationDir,
    file: "pause-propagation-flow.svg",
    title: "FluxPausePropagationFlow",
    width: 1000,
    height: 280,
    nodes: [
      { id: "A", label: "开启 Treasury\n或本地 Pause", x: 60, y: 120, tone: "blue" },
      { id: "B", label: "奖励 / 回购\n链路被阻断", x: 300, y: 120, tone: "coral" },
      { id: "C", label: "解除\nPause", x: 540, y: 120, tone: "amber" },
      { id: "D", label: "链路按依赖\n顺序恢复", x: 780, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"]],
  },
  {
    dir: regressionDir,
    file: "regression-overview.svg",
    title: "Regression Overview",
    width: 1200,
    height: 360,
    nodes: [
      { id: "A", label: "Regression", x: 480, y: 40, tone: "slate" },
      { id: "B", label: "treasury-accounting", x: 60, y: 220, tone: "blue" },
      { id: "C", label: "rewards-accounting", x: 330, y: 220, tone: "teal" },
      { id: "D", label: "router-pair-critical", x: 600, y: 220, tone: "amber" },
      { id: "E", label: "cross-contract-linkage", x: 870, y: 220, tone: "coral" },
    ],
    edges: [["A", "B"], ["A", "C"], ["A", "D"], ["A", "E"]],
  },
  {
    dir: regressionDir,
    file: "treasury-accounting-overview.svg",
    title: "Treasury Accounting Regression",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "暂停 / 恢复 /\n治理边界", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "Allowlist 与\nDaily Cap", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "Approved Spender\nPull / Burn / Revoke", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "Native 与 ERC20\n双额度隔离", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "Emergency Withdraw\nTimelock", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: regressionDir,
    file: "rewards-accounting-overview.svg",
    title: "Rewards Accounting Regression",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "同币质押本金 /\n奖励隔离", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "Manager -> Pool\nSync", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "AllocPoint\n分账", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "Rounding\nCarry-Forward", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "Recover 与 Dust\n边界", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: regressionDir,
    file: "router-pair-critical-overview.svg",
    title: "Router Pair Critical Regression",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "多跳 / ETH /\nToken-WETH 路由", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "真实输入资产\n计费", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "Permit 与普通\n移除流动性", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "Flash Swap 成功 /\n失败边界", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "Tiny Swap 与\n最小流动性", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
  {
    dir: regressionDir,
    file: "cross-contract-linkage-overview.svg",
    title: "Cross Contract Linkage Regression",
    width: 1220,
    height: 280,
    nodes: [
      { id: "A", label: "Treasury\n指针一致性", x: 50, y: 120, tone: "blue" },
      { id: "B", label: "Buyback / Direct Reward /\nPause 传播", x: 285, y: 120, tone: "teal" },
      { id: "C", label: "Managed Pool Handoff\n与 Replacement", x: 520, y: 120, tone: "amber" },
      { id: "D", label: "Reward Config /\nOwner 迁移", x: 755, y: 120, tone: "coral" },
      { id: "E", label: "Operator 权限\n只能走 setOperator", x: 990, y: 120, tone: "slate" },
    ],
    edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
  },
];

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function estimateLineUnits(line) {
  let units = 0;

  for (const char of String(line)) {
    if (/[A-Z]/.test(char)) {
      units += 0.72;
      continue;
    }

    if (/[a-z0-9]/.test(char)) {
      units += 0.58;
      continue;
    }

    if (/\s/.test(char)) {
      units += 0.28;
      continue;
    }

    if (/[-_/+.>:]/.test(char)) {
      units += 0.34;
      continue;
    }

    units += 1;
  }

  return units;
}

function getEdgeRoute(a, b) {
  const aw = a.w || 206;
  const ah = a.h || 98;
  const bw = b.w || 206;
  const bh = b.h || 98;
  const acx = a.x + aw / 2;
  const acy = a.y + ah / 2;
  const bcx = b.x + bw / 2;
  const bcy = b.y + bh / 2;
  const dxCenter = bcx - acx;
  const dyCenter = bcy - acy;
  const verticalSeparated = a.y + ah <= b.y || b.y + bh <= a.y;
  const horizontalSeparated = a.x + aw <= b.x || b.x + bw <= a.x;
  const preferHorizontal = verticalSeparated
    ? false
    : horizontalSeparated
      ? true
      : Math.abs(dxCenter) >= Math.abs(dyCenter);

  if (preferHorizontal) {
    const forward = bcx >= acx;
    return {
      preferHorizontal,
      sourceSide: forward ? "right" : "left",
      targetSide: forward ? "left" : "right",
      sourceSort: bcy,
      targetSort: acy,
    };
  }

  const downward = bcy >= acy;
  return {
    preferHorizontal,
    sourceSide: downward ? "bottom" : "top",
    targetSide: downward ? "top" : "bottom",
    sourceSort: bcx,
    targetSort: acx,
  };
}

function edgePath(a, b, route = {}) {
  const aw = a.w || 206;
  const ah = a.h || 98;
  const bw = b.w || 206;
  const bh = b.h || 98;
  const acx = a.x + aw / 2;
  const acy = a.y + ah / 2;
  const bcx = b.x + bw / 2;
  const bcy = b.y + bh / 2;
  const meta = route.preferHorizontal === undefined ? getEdgeRoute(a, b) : route;
  const sourceOffset = route.sourceOffset || 0;
  const targetOffset = route.targetOffset || 0;
  let x1;
  let y1;
  let x2;
  let y2;

  if (meta.preferHorizontal) {
    x1 = meta.sourceSide === "right" ? a.x + aw : a.x;
    y1 = acy + sourceOffset;
    x2 = meta.targetSide === "left" ? b.x : b.x + bw;
    y2 = bcy + targetOffset;
  } else {
    x1 = acx + sourceOffset;
    y1 = meta.sourceSide === "bottom" ? a.y + ah : a.y;
    x2 = bcx + targetOffset;
    y2 = meta.targetSide === "top" ? b.y : b.y + bh;
  }

  if (route.startX !== undefined) {
    x1 = route.startX;
  }

  if (route.startY !== undefined) {
    y1 = route.startY;
  }

  const points = [{ x: x1, y: y1 }];

  if (meta.preferHorizontal) {
    if (Math.abs(y2 - y1) < 1) {
      points.push({ x: x2, y: y2 });
    } else {
      const dx = x2 - x1;
      const stem = Math.max(22, Math.min(40, Math.abs(dx) * 0.45));
      const laneDepth = ((route.sourceRank || 0) * 12) + ((route.targetRank || 0) * 8);
      const turnX = x1 + Math.sign(dx || 1) * stem;
      const laneX = turnX + Math.sign(dx || 1) * laneDepth;
      points.push({ x: laneX, y: y1 });
      points.push({ x: laneX, y: y2 });
      points.push({ x: x2, y: y2 });
    }
  } else {
    if (Math.abs(x2 - x1) < 1) {
      points.push({ x: x2, y: y2 });
    } else {
      const dy = y2 - y1;
      const stem = Math.max(22, Math.min(40, Math.abs(dy) * 0.45));
      const laneDepth = ((route.sourceRank || 0) * 12) + ((route.targetRank || 0) * 8);
      const laneY = y1 + Math.sign(dy || 1) * (stem + laneDepth);
      points.push({ x: x1, y: laneY });
      points.push({ x: x2, y: laneY });
      points.push({ x: x2, y: y2 });
    }
  }

  const cleanedPoints = [];
  for (const point of points) {
    const last = cleanedPoints[cleanedPoints.length - 1];
    if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) {
      cleanedPoints.push(point);
    }
  }

  const simplifiedPoints = [];
  for (const point of cleanedPoints) {
    simplifiedPoints.push(point);
    while (simplifiedPoints.length >= 3) {
      const p1 = simplifiedPoints[simplifiedPoints.length - 3];
      const p2 = simplifiedPoints[simplifiedPoints.length - 2];
      const p3 = simplifiedPoints[simplifiedPoints.length - 1];
      const sameX = Math.abs(p1.x - p2.x) < 0.01 && Math.abs(p2.x - p3.x) < 0.01;
      const sameY = Math.abs(p1.y - p2.y) < 0.01 && Math.abs(p2.y - p3.y) < 0.01;
      if (!sameX && !sameY) {
        break;
      }

      simplifiedPoints.splice(simplifiedPoints.length - 2, 1);
    }
  }

  const radius = 12;
  let path = `M ${simplifiedPoints[0].x} ${simplifiedPoints[0].y}`;

  for (let index = 1; index < simplifiedPoints.length - 1; index += 1) {
    const prev = simplifiedPoints[index - 1];
    const current = simplifiedPoints[index];
    const next = simplifiedPoints[index + 1];
    const inDx = current.x - prev.x;
    const inDy = current.y - prev.y;
    const outDx = next.x - current.x;
    const outDy = next.y - current.y;
    const inLength = Math.abs(inDx) + Math.abs(inDy);
    const outLength = Math.abs(outDx) + Math.abs(outDy);
    const corner = Math.min(radius, inLength / 2, outLength / 2);
    const startCorner = {
      x: current.x - Math.sign(inDx) * Math.min(corner, Math.abs(inDx)),
      y: current.y - Math.sign(inDy) * Math.min(corner, Math.abs(inDy)),
    };
    const endCorner = {
      x: current.x + Math.sign(outDx) * Math.min(corner, Math.abs(outDx)),
      y: current.y + Math.sign(outDy) * Math.min(corner, Math.abs(outDy)),
    };

    path += ` L ${startCorner.x} ${startCorner.y} Q ${current.x} ${current.y} ${endCorner.x} ${endCorner.y}`;
  }

  const lastPoint = simplifiedPoints[simplifiedPoints.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;

  return {
    path,
    startX: x1,
    startY: y1,
  };
}

function renderNode(node) {
  const w = node.w || 206;
  const h = node.h || 98;
  const palette = palettes[node.tone || "blue"];
  const lines = String(node.label).split("\n");
  const baseFontSize = node.fontSize || 15.5;
  const maxLineUnits = Math.max(...lines.map(estimateLineUnits));
  const availableWidth = w - 86;
  const fittedFontSize = Math.max(11.6, Math.min(baseFontSize, availableWidth / Math.max(1, maxLineUnits)));
  const lineHeight = fittedFontSize * 1.38;
  const textX = node.x + 58;
  const startY = node.y + h / 2 - ((lines.length - 1) * lineHeight) / 2 + fittedFontSize * 0.34;
  const text = lines
    .map((line, index) => `<tspan x="${textX}" y="${startY + index * lineHeight}">${esc(line)}</tspan>`)
    .join("");

  return `
    <g filter="url(#cardShadow)">
      <rect x="${node.x}" y="${node.y}" width="${w}" height="${h}" rx="26" fill="${palette.shell}" />
      <rect x="${node.x + 8}" y="${node.y + 8}" width="${w - 16}" height="${h - 16}" rx="20" fill="#ffffff" stroke="${palette.border}" stroke-width="1.6" />
      <rect x="${node.x + 18}" y="${node.y + 17}" width="${w - 36}" height="1.6" rx="0.8" fill="${palette.rule}" />
      <circle cx="${node.x + 28}" cy="${node.y + 24}" r="12" fill="${palette.badge}" />
      <text x="${node.x + 28}" y="${node.y + 28.5}" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI','Microsoft YaHei',sans-serif" font-size="12" font-weight="700" fill="#ffffff">${esc(node.id)}</text>
      <circle cx="${node.x + w - 22}" cy="${node.y + 24}" r="4.5" fill="${palette.badge}" opacity="0.18" />
      <text font-family="'Trebuchet MS','Segoe UI','Microsoft YaHei',sans-serif" font-size="${fittedFontSize}" font-weight="700" fill="${palette.text}" text-anchor="start">${text}</text>
    </g>`;
}

function renderEdge(edgeDescriptor) {
  const edge = edgePath(edgeDescriptor.source, edgeDescriptor.target, edgeDescriptor);
  return `
      <path d="${edge.path}" fill="none" stroke="#EFF4F9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />
      <path d="${edge.path}" fill="none" stroke="#CBD6E3" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)" opacity="1" />`;
}

function renderGuidePath(path) {
  return `
      <path d="${path}" fill="none" stroke="#EFF4F9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />
      <path d="${path}" fill="none" stroke="#CBD6E3" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" opacity="1" />`;
}

function renderDiagram(diagram) {
  const edgeDescriptors = diagram.edges.map(([from, to], index) => {
    const source = diagram.nodes.find((node) => node.id === from);
    const target = diagram.nodes.find((node) => node.id === to);
    const route = getEdgeRoute(source, target);
    return {
      index,
      from,
      to,
      source,
      target,
      ...route,
      sourceOffset: 0,
      targetOffset: 0,
    };
  });

  const distributeOffsets = (descriptors, keySelector, sortSelector, field, rankField, countField) => {
    const groups = new Map();

    for (const descriptor of descriptors) {
      const key = keySelector(descriptor);
      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(descriptor);
    }

    for (const group of groups.values()) {
      group.sort((left, right) => {
        const delta = sortSelector(left) - sortSelector(right);
        return delta !== 0 ? delta : left.index - right.index;
      });

      const spacing = 18;
      const center = (group.length - 1) / 2;
      group.forEach((descriptor, offsetIndex) => {
        descriptor[field] = (offsetIndex - center) * spacing;
        descriptor[rankField] = offsetIndex;
        descriptor[countField] = group.length;
      });
    }
  };

  distributeOffsets(
    edgeDescriptors,
    (descriptor) => `${descriptor.from}:${descriptor.sourceSide}`,
    (descriptor) => descriptor.sourceSort,
    "sourceOffset",
    "sourceRank",
    "sourceCount",
  );

  distributeOffsets(
    edgeDescriptors,
    (descriptor) => `${descriptor.to}:${descriptor.targetSide}`,
    (descriptor) => descriptor.targetSort,
    "targetOffset",
    "targetRank",
    "targetCount",
  );

  const sharedSourceGroups = new Map();
  for (const descriptor of edgeDescriptors) {
    const key = `${descriptor.from}:${descriptor.sourceSide}`;
    if (!sharedSourceGroups.has(key)) {
      sharedSourceGroups.set(key, []);
    }

    sharedSourceGroups.get(key).push(descriptor);
  }

  const sharedGuideMarkup = [];
  for (const group of sharedSourceGroups.values()) {
    if (group.length < 3 || group[0].preferHorizontal) {
      continue;
    }

    const source = group[0].source;
    const sw = source.w || 206;
    const sh = source.h || 98;
    const sourceCenterX = source.x + sw / 2;
    const sourceY = group[0].sourceSide === "bottom" ? source.y + sh : source.y;
    const direction = group[0].sourceSide === "bottom" ? 1 : -1;
    const busY = sourceY + direction * (34 + Math.max(0, group.length - 3) * 8);
    const branchXs = group
      .map((descriptor) => {
        const target = descriptor.target;
        const tw = target.w || 206;
        return target.x + tw / 2 + (descriptor.targetOffset || 0);
      })
      .sort((left, right) => left - right);
    const minX = branchXs[0];
    const maxX = branchXs[branchXs.length - 1];

    sharedGuideMarkup.push(renderGuidePath(`M ${sourceCenterX} ${sourceY} L ${sourceCenterX} ${busY}`));

    if (Math.abs(maxX - minX) > 0.01) {
      sharedGuideMarkup.push(renderGuidePath(`M ${minX} ${busY} L ${maxX} ${busY}`));
    }

    group.forEach((descriptor) => {
      const target = descriptor.target;
      const tw = target.w || 206;
      descriptor.startX = target.x + tw / 2 + (descriptor.targetOffset || 0);
      descriptor.startY = busY;
      descriptor.sourceOffset = 0;
    });
  }

  const edgeMarkup = edgeDescriptors
    .map((descriptor) => renderEdge(descriptor))
    .join("\n      ");

  const nodeMarkup = diagram.nodes.map(renderNode).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(diagram.title)}</title>
  <desc id="desc">${esc(diagram.title)} flow diagram</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#FBFCFE" />
      <stop offset="100%" stop-color="#F1F5FA" />
    </linearGradient>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 52) rotate(14) scale(340 180)">
      <stop offset="0%" stop-color="#DCE9FF" stop-opacity="0.82" />
      <stop offset="100%" stop-color="#DCE9FF" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${diagram.width - 140} ${diagram.height - 36}) rotate(-10) scale(300 150)">
      <stop offset="0%" stop-color="#FFE8D8" stop-opacity="0.7" />
      <stop offset="100%" stop-color="#FFE8D8" stop-opacity="0" />
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.15" fill="#D7E1ED" opacity="0.48" />
    </pattern>
    <filter id="cardShadow" x="-20%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#243B5514" />
    </filter>
      <marker id="arrow" markerWidth="13" markerHeight="13" refX="10.4" refY="6.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M 1.2 1.2 L 10.4 6.5 L 1.2 11.8 L 3.8 6.5 Z" fill="#CBD6E3" />
      </marker>
  </defs>
  <rect x="0" y="0" width="${diagram.width}" height="${diagram.height}" rx="28" fill="url(#bg)" />
  <rect x="0" y="0" width="${diagram.width}" height="${diagram.height}" rx="28" fill="url(#dots)" opacity="0.32" />
  <ellipse cx="180" cy="52" rx="340" ry="180" fill="url(#glowA)" />
  <ellipse cx="${diagram.width - 140}" cy="${diagram.height - 36}" rx="300" ry="150" fill="url(#glowB)" />
  <rect x="34" y="28" width="84" height="24" rx="12" fill="#17314D" />
  <text x="76" y="44" text-anchor="middle" font-family="'Trebuchet MS','Segoe UI','Microsoft YaHei',sans-serif" font-size="11" font-weight="700" letter-spacing="0.6" fill="#FFFFFF">测试流程</text>
  <text x="34" y="84" font-family="'Trebuchet MS','Segoe UI','Microsoft YaHei',sans-serif" font-size="25" font-weight="700" fill="#1D3148">${esc(diagram.title)}</text>
  <text x="34" y="107" font-family="'Trebuchet MS','Segoe UI','Microsoft YaHei',sans-serif" font-size="12" fill="#698096">左到右展示关键执行路径与状态流转</text>
    <rect x="34" y="118" width="148" height="4" rx="2" fill="#2C4E71" opacity="0.18" />
    <g>
      ${sharedGuideMarkup.join("\n      ")}
      ${edgeMarkup}
    </g>
  <g>
${nodeMarkup}
  </g>
</svg>`;
}

for (const diagram of diagrams) {
  const svg = renderDiagram(diagram);
  fs.writeFileSync(path.join(diagram.dir, diagram.file), svg, "utf8");
}
