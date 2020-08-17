'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() : typeof define === 'function' && define.amd ? define(factory) : (global = global || self, global.Monitor = factory());
})(undefined, () => {
    'use strict';

    // 上报的数据

    let reportResult = {
        reportUrl: '',
        projectName: '',
        timeout: '',
        maxSize: '',
        ajaxSuccessField: '',
        ajaxSuccessCode: '',
        customData: {},

        // 监控数据上报时间
        reportTime: '',
        userAgent: navigator.userAgent,

        // 性能相关的数据
        performance: {
            // 其他时间
            common: {
                // DNS解析时间
                dnsTime: '',
                // TCP建立连接时间
                tcpTime: '',
                // 白屏时间
                firstPaintTime: '',
                // dom渲染完成时间
                domReadyTime: '',
                // 页面onload时间
                loadFinshedTime: ''
            },
            // 超时的资源
            timeout: [],
            // 超大的资源
            maxSize: []
        },

        // ajax相关的数据，abort、error、timeout、http code不是200-400、接口响应时间大于config.timeout等等的请求
        ajax: []

        // JS错误

    };

    // navigator.sendBeacon只能发送少量数据，所以这里限制了一下
    const maxResponseLength = 1000;

    // performance
    const performance = global.performance || global.webkitPerformance || global.msPerformance || global.mozPerformance || global.oPerformance;

    // 返回数据类型
    function getType(data) {
        return {}.toString.call(data).replace(/\[object\s(\w+)\]/g, '$1');
    }

    // 格式化headers
    function formatHeaders(headers) {
        let arr = headers.split('\r\n');
        let result = {};
        arr.forEach(item => {
            let iitem = item.split(': ') || [];
            result[iitem[0]] = iitem[1];
        });
        return result;
    }

    // 格式化cookie
    function formatCookie(cookie) {
        let arr = cookie.split('; ') || [];
        let result = {};
        arr.forEach(item => {
            let iitem = item.split('=') || [];
            result[iitem[0]] = iitem[1];
        });
        return result;
    }

    // class Monitor
    class Monitor {
        constructor(config = {}) {
            // 上报地址
            this.reportUrl = config.reportUrl || 'http://localhost:8080/';
            // 监控的项目名称
            this.projectName = config.projectName || 'myProject';
            // 超时设置(包含请求超时、ajax超时等)，单位毫秒。请求时间超过此值的请求将上报
            this.timeout = config.timeout || 3000;
            // 大小设置，单位字节B。资源大小超过此值的请求将上报，这里是300K
            this.maxSize = config.maxSize || 300 * 1024;
            // 接口返回的code的字段名称
            this.ajaxSuccessField = config.ajaxSuccessField || 'errno';
            // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
            //{
            //  "errno": 404,
            //  "errmsg": "接口不存在",
            //  "data": [],
            // }
            this.ajaxSuccessCode = config.ajaxSuccessCode || 200;

            // 用户自定义的其他的需要上报的数据
            this.customData = config.customData || {};
        }

        // init
        init() {
            if (!performance || !navigator.sendBeacon) {
                return;
            }

            let self = this;

            // config data
            reportResult.reportUrl = this.reportUrl;
            reportResult.projectName = this.projectName;
            reportResult.timeout = this.timeout + '(ms)';
            reportResult.maxSize = this.maxSize + '(B)';
            reportResult.ajaxSuccessField = this.ajaxSuccessField;
            reportResult.ajaxSuccessCode = this.ajaxSuccessCode;
            reportResult.customData = (0, _assign2.default)({}, this.customData);

            // XMLHttpRequest劫持
            let originOpen = XMLHttpRequest.prototype.open;
            let originSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                // 获取请求的相关参数
                this.ajaxObj = {
                    method,
                    url: url.match(/http(s)?:\/\//) ? url : location.origin + url,
                    async,
                    user,
                    password
                };

                // 执行原来的open
                originOpen.call(this, method, url, async, user, password);
            };
            XMLHttpRequest.prototype.send = function (data) {
                // 获取请求的数据
                if (getType(data) == 'FormData') {
                    this.ajaxObj.params = {};
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = (0, _getIterator3.default)(data), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            let key = _step.value;

                            this.ajaxObj.params[key[0]] = key[1];
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return) {
                                _iterator.return();
                            }
                        } finally {
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                } else {
                    try {
                        this.ajaxObj.params = data ? JSON.parse(data) : {};
                    } catch (err) {
                        this.ajaxObj.params = data || {};
                    }
                }

                // cookie
                this.ajaxObj.cookie = formatCookie(document.cookie);

                // response
                this.ajaxObj.response = {};

                // abort
                this.addEventListener('abort', e => {
                    this.ajaxObj.headers = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口abort';
                    reportResult.ajax.push(this.ajaxObj);
                }, false);
                // error
                this.addEventListener('error', e => {
                    this.ajaxObj.headers = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口error';
                    reportResult.ajax.push(this.ajaxObj);
                }, false);
                this.addEventListener('timeout', e => {
                    this.ajaxObj.headers = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口timeout';
                    reportResult.ajax.push(this.ajaxObj);
                }, false);
                // load
                this.addEventListener('load', e => {
                    this.ajaxObj.headers = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    if (this.readyState == XMLHttpRequest.DONE) {
                        // 成功时
                        if (this.status >= 200 && this.status < 400) {
                            // 获取时长
                            let duration = performance.getEntriesByName(this.responseURL)[0] ? performance.getEntriesByName(this.responseURL)[0].duration : 0;

                            // 获取response。不是所有的response都能解析的，比如二进制数据，所以这里try catch
                            let response = {};
                            try {
                                response = this.responseText ? JSON.parse(this.responseText) : {};
                            } catch (err) {
                                response = {
                                    'canNotParse': this.responseText.toString()
                                };
                                console.warn(`response数据为：${this.responseText}，不是正确的JSON格式，无法解析`);
                            }

                            // 超过设置的超时时间时
                            if (duration > self.timeout) {
                                this.ajaxObj.errMsg = `接口成功返回，但是花费了${duration}ms，时间超过了设置的timeout：${self.timeout}ms`;
                            }

                            // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
                            //{
                            //  "errno": 25005,
                            //  "errmsg": "接口不存在",
                            //  "data": [],
                            // }
                            if (response[self.ajaxSuccessField] != self.ajaxSuccessCode) {
                                this.ajaxObj.errMsg = `接口成功返回，但是不是正常的状态，其response.${self.ajaxSuccessField}不是${self.ajaxSuccessCode}`;
                            }

                            // 将超时的和返回数据不对的接口进行上报
                            if (duration > self.timeout || response[self.ajaxSuccessField] != self.ajaxSuccessCode) {
                                // navigator.sendBeacon只能发送少量数据，所以这里限制了一下
                                if ((0, _stringify2.default)(response).length > maxResponseLength) {
                                    this.ajaxObj.response = `response数据太大，不进行上报，如有需要请查看业务代码确认response`;
                                } else {
                                    this.ajaxObj.response = response || {};
                                }
                                reportResult.ajax.push(this.ajaxObj);
                            }
                        }
                        // 失败时
                        else {
                                this.ajaxObj.errMsg = this.statusText || `接口成功返回，但是http code为${this.status}，不是200-400`;
                                reportResult.ajax.push(this.ajaxObj);
                            }
                    }
                }, false);

                originSend.call(this, data);
            };

            // 劫持fetch请求
            // 这种功能以前是使用 XMLHttpRequest 实现的。Fetch 提供了一个更理想的替代方案，可以很容易地被其他技术使用，例如  Service Workers


            // unloadCbk
            // performance.timing一般都是放在onload事件之后，我们这里直接放在unload之后
            // performance.getEntries之所以放在unloadCbk里面，是因为performance.getEntries会随着页面的交互而逐渐增加，放在unloadCbk外面只能获取初始化的请求
            let unloadCbk = () => {
                // 获取performance.common
                let timing = performance.timing;
                reportResult.performance.common.dnsTime = timing.domainLookupEnd - timing.domainLookupStart + ' ms';
                reportResult.performance.common.tcpTime = timing.connectEnd - timing.connectStart + ' ms';
                reportResult.performance.common.firstPaintTime = timing.responseStart - timing.requestStart + ' ms';
                reportResult.performance.common.domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart + ' ms';
                reportResult.performance.common.loadFinshedTime = timing.loadEventEnd - timing.navigationStart + ' ms';

                // 获取performance.timeout和performance.maxSize
                let requestList = performance.getEntries() || [];
                requestList.forEach(item => {
                    if (item.duration > this.timeout) {
                        reportResult.performance.timeout.push({
                            name: item.name,
                            duration: item.duration + ' ms'
                        });
                    }
                    if (item.decodedBodySize > this.maxSize) {
                        reportResult.performance.maxSize.push({
                            name: item.name,
                            // transferSize 表示资源传输总大小，包含header
                            // encodedBodySize 表示压缩之后的body大小
                            // decodedBodySize 表示解压之后的body大小
                            size: item.decodedBodySize + ' B'
                        });
                    }
                });

                // 上报
                reportResult.reportTime = new Date().toLocaleString();
                try {
                    // navigator.sendBeacon只能发送少量数据，超过限制后将返回false
                    let isReportSuccess = navigator.sendBeacon(this.reportUrl, (0, _stringify2.default)(reportResult, null, '\t'));
                    !isReportSuccess && console.error('上报失败，请检查上报数据大小');
                } catch (err) {
                    console.error('上报出错');
                }
            };

            // unload监听。利用navigator.sendBeacon一个页面只需要上报一次，就算浏览器关闭后，navigator.sendBeacon也能发送消息进行上报
            global.addEventListener('unload', unloadCbk, false);
        }
    }

    return Monitor;
});