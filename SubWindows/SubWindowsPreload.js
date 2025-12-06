const {contextBridge,ipcRenderer}=require("electron");
console.log("SubWindowsPreload.js is loaded");
contextBridge.exposeInMainWorld("SubWindowResizeAPI",
    (width,height)=>ipcRenderer.invoke("WindowResize","SubWindow",width,height)
);
contextBridge.exposeInMainWorld("SubWindowMainProcessAPI",
    {
        //初期化用のリスナーなので一度実行されると消える
        initializeSubWindow:(initializecallback)=>ipcRenderer.once("initializeSubWindow",initializecallback),//SubWindowの初期化を行う
        /*MainProcessとSubWindowRendererのデータのやり取り*/
        //sub=>MainProcess
        FromSubToMainProcess:(data)=>ipcRenderer.send("FromSubToMainProcess",data),
        //MainProcess=>sub
        FromMainProcessToSub:(callback)=>ipcRenderer.on("FromMainProcessToSub",callback),
        //サブウィンドウ終了通知＆最終送信
        CloseSubWindowFromMainProcessToSub:(Closingcallback)=>ipcRenderer.once("CloseSubWindowFromMainProcessToSub",Closingcallback),
        CloseSubWindowFromSubToMainProcess:(data)=>ipcRenderer.send("CloseSubWindowFromSubToMainProcess",data)
    }
);