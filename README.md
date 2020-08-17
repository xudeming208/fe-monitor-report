<h1 align="center">
  fe-monitor-report
</h1>
<br>
<p align="center">
  <a href="https://travis-ci.org/xudeming208/fe-monitor-report"><img src="https://travis-ci.org/xudeming208/fe-monitor-report.svg?branch=master" alt="Travis Status"></a>
  <!-- <a href='https://coveralls.io/github/xudeming208/mid-cli'><img src='https://coveralls.io/repos/github/xudeming208/mid-cli/badge.svg' alt='Coverage Status' /></a> -->
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/fe-monitor-report.svg" alt="Nodejs"></a>
  <a href="https://www.npmjs.com/package/fe-monitor-report"><img src="https://img.shields.io/npm/v/fe-monitor-report.svg" alt="Version"></a>
  <a href="https://npmcharts.com/compare/fe-monitor-report?minimal=true"><img src="https://img.shields.io/npm/dm/fe-monitor-report.svg" alt="Downloads"></a>
  <a href="https://github.com/xudeming208/fe-monitor-report/graphs/contributors"><img src="https://img.shields.io/github/contributors/xudeming208/fe-monitor-report.svg" alt="Contributors"></a>
  <a href="https://www.npmjs.com/package/fe-monitor-report"><img src="https://img.shields.io/github/license/xudeming208/fe-monitor-report.svg" alt="License"></a>
</p>

## 介绍
前端监控上报系统，能够统计页面性能、ajax监控及页面错误，并能进行上报

## 安装

```javascript
// npm：
npm i fe-monitor-report -S
// 浏览器：
<scripe src="//www.example.com/asset/js/fe-monitor-report.js"></scripe>
```

## 使用

```javascript
// npm
const Monitor = require('fe-monitor-report');
const monitor = new Monitor({
	// 上报地址
    reportUrl: 'http://localhost:8080/',
    // 监控的项目名称
    projectName: 'myProject',
    // 超时设置(包含请求超时、ajax超时等)，单位毫秒。请求时间超过此值的请求将上报
    timeout: 3000,
    // 大小设置，单位字节B。资源大小超过此值的请求将上报，这里是300K
    maxSize: 300 * 1024,
    // 接口返回的code的字段名称
    ajaxSuccessField: 'errno',
    // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
    //{
    //  "errno": 404,
    //  "errmsg": "接口不存在",
    //  "data": [],
    // }
    ajaxSuccessCode: 200,

    // 用户自定义的其他的需要上报的数据
    customData: {},
});
monitor.init();

// 浏览器：
const monitor = new window.Monitor({
	// 上报地址
    reportUrl: 'http://localhost:8080/',
});
monitor.init();
```

## 后端接口(nodejs版)
后端接口例子请参考report.js

## Options

参数 | 解释 | 默认值
-|-|-
reportUrl | 上报地址 | http://localhost:8080/
projectName | 监控的项目名称 | myProject
timeout | 超时设置(包含请求超时、ajax超时等)，单位毫秒。请求时间超过此值的请求将上报 | 3000
maxSize | 大小设置，单位字节B。资源大小超过此值的请求将上报 | 300 * 1024
ajaxSuccessField | 接口返回的code的字段名称 | errno
ajaxSuccessCode | 接口返回的code的值 | 200
customData | 用户自定义的其他的需要上报的数据 | {}
