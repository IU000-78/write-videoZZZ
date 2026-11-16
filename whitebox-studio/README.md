# BLOCK / 白模空间预演
一个中文浏览器三维白模站位与机位工具。参考大厅示意图搭建初始布局，人物、场景几何体和摄影机都可以编辑。

## 最快打开
下载 `whitebox-studio.html` 后直接用 Edge 或 Chrome 打开。该文件已内联本工具代码，无需安装 Python 或 npm；仍需联网加载固定版本 Three.js。

## 源码运行
下载本目录到电脑，安装 Python 3 后在目录中打开终端：
~~~powershell
python -m http.server 8080
~~~
打开 http://localhost:8080 。也可以用 VS Code Live Server 或任意静态 HTTP 服务。
无需 npm 安装或构建。首次打开需联网从 jsDelivr 获取固定版本 Three.js 0.170.0；直接双击 index.html 可能被浏览器的 ES module 本地文件规则阻止。
若需要完全离线，可下载 Three.js 对应模块及 addons 并修改 importmap，当前版本未内置离线依赖。

## 使用
- 左侧添加人物、摄影机、墙体、立柱、门框、方块；场景初始为 20×16 米大厅。
- 拖动对象可在地面移动；右侧准确输入 X/Z 坐标、尺寸、朝向。0° 朝北（−Z）、90° 朝东（+X），Y 朝上。
- 空白处左键拖动旋转总览，右键平移，滚轮缩放；俯视平面有独立正交视角。
- 摄影机支持位置、高度、12–200 mm 焦距、水平角、俯仰角、侧倾角，以及持续对准指定人物。
- 右侧取景画幅支持 9:16、16:9、1:1、4:3、2.39:1。焦距基于 Three.js filmGauge=36 mm 的长边传感器约定，切换画幅会影响水平/垂直视野。
- “导出站位图”输出总览 PNG，包含名称和距离；“导出取景图”输出不含摄影机、标签和编辑辅助线的 PNG。
- 距离检查为两位人物脚下的水平直线距离，不是行走路径或人体表面距离。
- 工程在当前浏览器 localStorage 自动保存；下载/导入 JSON 可跨设备备份。导入前验证版本、对象类型、重复 ID、数值和对象数量。
- 撤销 Ctrl+Z、重做 Ctrl+Shift+Z、保存 Ctrl+S、Delete 删除、方向键移动 0.25 米，Shift+方向键移动 1 米。

## 边界
这是静态几何白模编辑器；没有图片自动重建、模型导入、骨骼动作或视频渲染功能。建筑、人物为示意模型。最多 300 个对象。
相机朝向锁定人物时，手动水平/俯仰参数由目标计算；切换手动模式后可自由调整。画幅为整个工程的共同设置。

## 文件
- whitebox-studio.html：可直接打开的单文件成品；`node build.mjs` 可从源码重新生成
- build.mjs：可重复的单文件打包脚本
- index.html：界面与导入映射
- app.js：三维场景、交互、取景、保存和导出
- core.js：工程数据、数值约束和数学函数
- tests.mjs：核心数据验证与数学检查；在本目录运行 node tests.mjs

## 技术依据
- Three.js 相机：https://threejs.org/manual/en/cameras.html
- OrbitControls：https://threejs.org/docs/pages/OrbitControls.html
- Raycaster：https://threejs.org/docs/pages/Raycaster.html

源码为独立工具目录，不修改仓库已有提示词技能。
