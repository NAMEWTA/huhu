# E1：只把 shared.css 放进 components 层（其余不变），与 origin 基线比对（Claude 明 / 暗）
结果：计算样式失败项 214，宽度矩阵失败项 73；像素比对有失败。

## tasks-list--claude-light 默认状态差异（前 8 条）
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0  height: 607.5px → 624px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  ::placeholder.font-size: 11px → 12px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  ::placeholder.line-height: 16.5px → 18px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  ::selection.font-size: 11px → 12px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  ::selection.line-height: 16.5px → 18px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  height: 43.5px → 63px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  gap: 14px → 12px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/main:1/div:2/div:0/div:0  grid-template-columns: 104px 541px 110px 125px 150px 26px → 19px 697px 92px 110px 120px 28px

## note-editor--claude-light 默认状态差异（前 8 条）
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0  width: 36px → 40px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0  min-width: 36px → 40px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0  min-height: 392.25px → 361.516px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0/div:0  width: 30px → 20px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0/div:0/div:1  width: 30px → 20px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0/div:0/div:1  height: 45.875px → 39.1406px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0/div:0/div:1  min-width: 30px → 20px
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:3/div:0/div:0/div:0/div:1/div:0/div:0/div:1  margin-top: 20px → 12px

## archives-detail--claude-light 默认状态差异（前 8 条）
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.display: inline → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.position: static → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.top: auto → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.right: auto → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.bottom: auto → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.left: auto → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.z-index: auto → undefined
      ~ /body:1/div:0/div:0/div:1/main:1/div:2/div:0/div:0/div:1/section:1/div:4  ::-webkit-scrollbar.float: none → undefined
