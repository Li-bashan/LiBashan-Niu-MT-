# iOS 快捷指令配置说明

这套方案使用 iOS 快捷指令定时调用小牛 App 的快捷任务，再把结果 POST 到云端接口。Windows 桌面浮窗只读取云端 `/state`，所以电脑端不需要登录小牛账号。

## 自动化建议

建议至少配置 2 个定时自动化：

- `14:00，每天`：下午上班前刷新一次电量。
- `21:15，每天`：晚上回家/睡前刷新一次电量。
- 可选：`打开微信时` 或其他高频 App 时触发，作为补充刷新。

## 快捷指令动作顺序

1. 从「共享表单」接收输入，没有输入时继续。
2. 执行小牛快捷任务「查询车辆电量」。
3. 将返回的 `textResponse` 存入变量 `niu_status_text`。
4. 执行小牛快捷任务「查询车辆位置」。
5. 将返回的 `textResponse` 存入变量 `niu_location_text`。
6. 新建字典：
   - `vehicle`: `李巴山的小牛`
   - `raw1`: `niu_status_text`
   - `raw2`: `niu_location_text`
7. 使用「获取 URL 内容」发送 POST 请求：
   - URL: `https://your-domain.example/niu?token=YOUR_WRITE_TOKEN`
   - 方法: `POST`
   - 请求正文: `JSON`
   - 内容: 上一步的字典

## 公开仓库注意事项

不要把真实服务器 IP、域名、token 截图上传到公开仓库。README 和示意图中统一使用 `your-domain.example` 和 `YOUR_WRITE_TOKEN` 占位。
