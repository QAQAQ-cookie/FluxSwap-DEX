package labels

var OperationTypeLabels = map[string]string{
	"distribute_rewards": "分发奖励",
	"withdraw_token":     "提取代币",
	"pause_treasury":     "暂停金库",
	"resume_treasury":    "恢复金库",
	"set_operator":       "设置操作员",
	"set_token_policy":   "设置代币策略",
}

var StatusLabels = map[string]string{
	"queued":    "待执行",
	"ready":     "可执行",
	"executing": "执行中",
	"executed":  "已执行",
	"cancelled": "已取消",
	"failed":    "失败",
	"missing":   "链上缺失",
}

var ModuleLabels = map[string]string{
	"auth":        "认证",
	"treasury":    "金库管理",
	"farm":        "农场管理",
	"token":       "代币管理",
	"sync":        "链上同步",
	"maintenance": "系统维护",
}

var ActionLabels = map[string]string{
	"auth_nonce":         "生成登录随机数",
	"auth_verify":        "验证管理员登录",
	"schedule_operation": "排队治理操作",
	"update_operation":   "更新治理操作",
	"execute_operation":  "执行治理操作",
	"cancel_operation":   "取消治理操作",
	"sync_chain_state":   "同步链上状态",
	"cleanup_expired":    "清理过期认证数据",
	"reset_local_data":   "重置本地管理数据",
}

var ResultLabels = map[string]string{
	"success": "成功",
	"failed":  "失败",
	"pending": "处理中",
}

func OperationType(code string) string {
	return lookup(OperationTypeLabels, code, code)
}

func Status(code string) string {
	return lookup(StatusLabels, code, code)
}

func Module(code string) string {
	return lookup(ModuleLabels, code, code)
}

func Action(code string) string {
	return lookup(ActionLabels, code, code)
}

func Result(code string) string {
	return lookup(ResultLabels, code, code)
}

func lookup(values map[string]string, code string, fallback string) string {
	if label, ok := values[code]; ok {
		return label
	}
	return fallback
}
