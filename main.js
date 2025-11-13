const {app,BrowserWindow,dialog,ipcMain,screen} = require('electron');
const path = require('path');
const fs = require('fs');
const WindowManager=new Map();
//メインウィンドウの作成
function createMainWindow(){
    const MainWindow = new BrowserWindow({
        width: 800,
        height: 500,
        useContentSize:true,
        maximizable:false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload:path.join(__dirname,"MainWindow","MainWindowPreload.js")
        }
    });
    WindowManager.set("MainWindow",MainWindow);
    MainWindow.removeMenu();
    //MainWindow.webContents.openDevTools({mode: 'detach'});
    MainWindow.loadFile(path.join("MainWindow","MainWindow.html"));
    /*
    ipcMain.on("FromMainToMainProcess",(event,data)=>{
        const SubWindow=WindowManager.get("SubWindow");
        SubWindow.webContents.send("FromMainProcessToSub",data);
    });
    */
   //サブウィンドウが開いていたとしてもメインウィンドウの終了と同時にアプリを終了する
   MainWindow.on("closed",()=>{
    app.quit();
   });
}

app.whenReady().then(() => {
    createMainWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
//全てのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
/*ディスプレイサイズを渡すハンドラ*/
ipcMain.handle("GetDisplaySize",(event)=>{
    const {width,height}=screen.getPrimaryDisplay().workAreaSize;
    console.log("Display Size",width,height);
    return {width,height};
});
/*ファイル読み込みのためのIPCハンドラ*/
ipcMain.handle("selectFiles", async (event, propertieslist)=>{
    //dialogを開き、ファイル、フォルダを選択
    const result=await dialog.showOpenDialog({
        properties:propertieslist,
    });
    if(result.canceled || result.filePaths.length === 0) {
        console.error("No files selected.");
        return [];
    }
    //問題なければ選択したパスを返す
    return result.filePaths;
});
ipcMain.handle("loadDicom", async (event,SelectedPath)=>{
    //読み込むべきファイルパスを集計
    //ファイル読み込みもフォルダ読み込みも同様の手続きで行う
    //現時点では拡張子のチェックでDICOMかどうか判断する
    //SelectedPathがフォルダの場合は、そのフォルダ内の全てのDICOMファイルを対象とする。
    //SelectedPathがファイルの場合は、そのファイルのみを対象とする。
    const dicomPaths=[];
    //console.log("Check",SelectedPath,typeof(SelectedPath));
    let PathType;
    try{
        PathType=await fs.promises.stat(SelectedPath);
    }catch(error){
        console.log("パスの取得に失敗",error);
        return null;
    }
    if(PathType.isDirectory()) {
        const files = fs.readdirSync(SelectedPath);
        for(const file of files){
            const filePath = path.join(SelectedPath, file);
            if(fs.statSync(filePath).isFile() && filePath.endsWith('.dcm')) {
                dicomPaths.push(filePath);
            }
        }
    }else if(PathType.isFile()){
        if(SelectedPath.endsWith('.dcm')){
            dicomPaths.push(SelectedPath);
        }
    }
    if(dicomPaths.length === 0) {
        console.error("No DICOM files found.",SelectedPath);
        return null;
    }
    //dicomPathsをArrayBufferに変換
    //上でdicomPathsが空のときのケースを判定しているので、ここまでくれば必ず何かしらのデータが返る
    const items = [];
    for(const dicomPath of dicomPaths){
        const buf=fs.readFileSync(dicomPath);
        const arraybuffer=buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        items.push({"name":path.basename(dicomPath),"arrayBuffer":arraybuffer});
    }
    //console.log("Loaded DICOM files:", items);
    return items;
});

ipcMain.on("MainWindowResize",(event,width,height)=>{
    //console.log("Check",width,height)
    const targetWindow=WindowManager.get("MainWindow");
    try{
        targetWindow.setContentSize(width,height);
        //リサイズが完了したら、現在のウィンドウサイズを取得して画面中央に移動させる
        const [windowwidth,windowheight]=targetWindow.getSize();
        //console.log(windowwidth,windowheight);
        const {width:displaywidth,height:displayheight}=screen.getPrimaryDisplay().workAreaSize;
        //console.log(displaywidth,displayheight);
        const x=Math.floor((displaywidth-windowwidth)/2);
        const y=Math.floor((displayheight-windowheight)/2);
        //console.log("########################Check CenterP",x,y);
        targetWindow.setPosition(x,y);
    }catch(e){
        console.log(e);
    }
});

/*SubWindow関連のIPCハンドラ*/
//SubWindowを開くように命令する
function createSubWindow(SendingData){
    //const header=SendingData.get("header");
    const actionName=SendingData.get("action");
    const HTMLfileName=actionName+".html";
    const windowsize=SendingData.get("data").get("windowsize");
    const SubWindow = new BrowserWindow({
        width: windowsize[0],
        height: windowsize[1],
        useContentSize:true,
        //maximizable:false,
        resizable:false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload:path.join(__dirname,"SubWindows","SubWindowsPreload.js"),
        }
    });
    WindowManager.set("SubWindow",SubWindow);
    SubWindow.removeMenu();
    //SubWindow.webContents.openDevTools({mode: 'detach'});
    SubWindow.loadFile(path.join(__dirname,"SubWindows",actionName,HTMLfileName));
    SubWindow.setAlwaysOnTop(true);
    //SubWindowの準備が整ったらOperationModeの可否の返答を受け取る
    SubWindow.webContents.once("did-finish-load",()=>{
        //初期化用の送信
        //console.log("SubWindow did-finish-load");
        SubWindow.webContents.send("initializeSubWindow",SendingData);
    });
    /*双方通信の構築*/
    //sub→main
    //console.log("######################## main.js Event Create");
    //console.log(header);
    ipcMain.on("FromSubToMainProcess",(e,data)=>{
        const MainWindow=WindowManager.get("MainWindow");
        MainWindow.webContents.send("FromMainProcessToMain",data);
    });
    //main→sub
    ipcMain.on("FromMainToMainProcess",(e,data)=>{
        SubWindow.webContents.send("FromMainProcessToSub",data);
    });
    //SubWindowが閉じられたときの処理
    //ウィンドウを閉じるときにこれを登録する
    /*
    SubWindow.on("closed",()=>{
        //SubWindowが閉じられたことをMainWindowに伝える
        const MainWindow=WindowManager.get("MainWindow");
        if(MainWindow&&!MainWindow.isDestroyed()){
            MainWindow.webContents.send("ReceiveSubWindowClosed",SendingData.get("header"));
        }
        //SubとMain用のチャンネルのイベントを消す。サブウィンドウは一つしか開かれないようにしているのですべて消してもよし
        //console.log("main.js Event Remove");
        ipcMain.removeAllListeners("FromSubToMainProcess");
        ipcMain.removeAllListeners("FromMainToMainProcess");
        //SubWindowをMapから削除
        WindowManager.delete("SubWindow");
    });
    */
    //SubWindowの終了処理
    //マインプロセス、またはユーザー操作による終了を想定
    //close発火⇒サブウィンドウに最後に送るデータがあるか要求
    //サブウィンドウクローズ中断し、サブウィンドウからの最後のデータをメインレンダラーに送る。
    //メインレンダラーにデータ送信後、サブウィンドウを閉じる
    SubWindow.once("close",(event)=>{
        //閉じるのを一時停止
        event.preventDefault();
        console.log("### Send SubWindow Closing this Window");
        //サブウィンドウに要求を送る前に、サブウィンドウからデータが送信された際の動きを登録することで検知漏れを防止する
        ipcMain.once("CloseSubWindowFromSubToMainProcess",(event,data)=>{
            //メインウィンドウに最後のデータを送り、OPモードのOFFなどの処理を行わせる
            const MainWindow=WindowManager.get("MainWindow");
            const SubWindow=WindowManager.get("SubWindow");
            //console.log(data);
            if(MainWindow&&!MainWindow.isDestroyed()){
                MainWindow.webContents.send("CloseSubWindowFromMainProcessToMain",data);
            }
            //SubとMain用のチャンネルのイベントを消す。サブウィンドウは一つしか開かれないようにしているのですべて消してもよし
            console.log("main.js Event Remove");
            ipcMain.removeAllListeners("FromSubToMainProcess");
            ipcMain.removeAllListeners("FromMainToMainProcess");
            //SubWindowのdestroy
            SubWindow.destroy();
            //SubWindowをMapから削除
            WindowManager.delete("SubWindow");
            
        });
        //サブウィンドウに最終通知
        const dammydata=true;
        SubWindow.webContents.send("CloseSubWindowFromMainProcessToSub",dammydata);
        //サブウィンドウからの最後のデータをメインレンダラーに送信する
        //CloseSubWindowFromMainProcessToSubを受けたサブウィンドウが
        //データをCloseSubWindowFromSubToMainProcessに送る。
        //これが発火すると上のipcMain.once("CloseSubWindowFromSubToMainProcess")によりサブウィンドウの破棄が行われる
    });
}
ipcMain.on("OrderSubWindowOpen",async (event,SendingData)=>{
    //headerを受け取って、SubWindowを開く
    //console.log("OrderSubWindowOpen",SendingData.get("header"));
    //既に開かれているSubWindowとの重複を避ける
    if(WindowManager.has("SubWindow")){
        const existingSubWindow=WindowManager.get("SubWindow");
        if(existingSubWindow && !existingSubWindow.isDestroyed()){
            //離れたところに欠かないならわざわざcloseで呼び出すようにしなくてもいいかも
            await new Promise((resolve)=>{//resolveはFunctionで、本来のclosed処理の後に後付けでresolveを返す関数を付けた感じ
                existingSubWindow.once("closed",resolve);//resolveの後付けはかならず本体closedの後ろに着くようになっている処理の流れ←なにかSubWindowが開かれてないと呼ばれない流れだから
                existingSubWindow.close();
            });
        }
    }
    //新しくSubwindowを開く
    //ついでにSendingDataも送ってしまう
    createSubWindow(SendingData);
});