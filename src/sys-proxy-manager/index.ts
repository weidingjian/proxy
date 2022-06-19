import { ProxyManager } from "../types";
import LinuxProxyManager from "./linux-proxy";
import MacProxyManager from "./mac-proxy";
import WinProxyManager from "./win-proxy";

const {platform} = process

export let proxyManager: ProxyManager;

if(/^win/.test(platform)) {
    proxyManager = new WinProxyManager();
} else if(/^linux/.test(platform)) {
    proxyManager = new LinuxProxyManager();
} else if(/^darwin/.test(platform)) {
    proxyManager = new MacProxyManager();
}
