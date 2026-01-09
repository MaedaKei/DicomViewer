const {app,BrowserWindow,dialog,ipcMain,screen} = require('electron');
const path = require('path');
const fs = require('fs');
const detach=!app.isPackaged&&true;//パッケージ化されてない、かつユーザーが望んだ場合に開発者ツールを開く
const WindowManager=new Map();
let AllowAddOrDeleteFlag=true;//データの追加・削除をしていい状態にあるか
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
    if(detach)MainWindow.webContents.openDevTools({mode: 'detach'});
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
ipcMain.handle("selectFiles", async (event,DialogTitle,PropertiesArray)=>{
    //dialogを開き、ファイル、フォルダを選択
    const MainWindow=WindowManager.get("MainWindow");
    const result=await dialog.showOpenDialog(MainWindow,{
        title:DialogTitle,
        properties:PropertiesArray,
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
//OSがウィンドウサイズの変更を終えるまでまつ
function ResizeWindow(TargetWindow,width,height){
    return new Promise(resolve=>{
        const [CurrentWidth,CurrentHeight]=TargetWindow.getContentSize();
        if(CurrentWidth===width&&CurrentHeight===height){
            //サイズが変わらない場合即resolve
            console.log("Size No Change",new Date().toISOString());
            resolve();
            return;
        }
        let timer=null;
        const ResizeFinishFunction=()=>{
            clearTimeout(timer);
            console.log("resize fired",new Date().toISOString());
            timer=setTimeout(()=>{
                TargetWindow.off("resize",ResizeFinishFunction);//イベントリスナーの解除
                console.log("Size Change Finished",new Date().toISOString());
                resolve();
                return;
            },50);//イベント発火などのタイミング保障のためのデバウンス
        };
        TargetWindow.on("resize",ResizeFinishFunction);
        console.log("Order Size Change",new Date().toISOString());
        TargetWindow.setContentSize(width,height);
    });
}
ipcMain.handle("WindowResize",async (event,WindowTarget,Width,Height)=>{
    //console.log("Check",width,height)
    const TargetWindow=WindowManager.get(WindowTarget);
    try{
        await ResizeWindow(TargetWindow,Width,Height);
        return {Success:true};
    }catch(e){
        console.log("WindowResize Error!!");
        console.log(e);
        return {Success:false};
    }
});
ipcMain.on("WindowMove",(event,WindowTarget)=>{
    const TargetWindow=WindowManager.get(WindowTarget);
    try{
        //対象とするウィンドウが最も重なっている割合が大きいウィンドウに収まるようにする。
        const TargetWindowBounds=TargetWindow.getBounds();
        const TargetDisplay=screen.getDisplayMatching(TargetWindowBounds);//どのディスプレイに最も重なっているか
        const TargetDisplayBounds=TargetDisplay.workArea;//この境界に収まるようにターゲットウィンドウを移動する
        const TargetDisplayMinX=TargetDisplayBounds.x;
        const TargetDisplayMaxX=TargetDisplayMinX+TargetDisplayBounds.width;
        const TargetDisplayMinY=TargetDisplayBounds.y;
        const TargetDisplayMaxY=TargetDisplayMinY+TargetDisplayBounds.height;
        //調整後の左上座標
        console.log("Current Display Infomation");
        console.log(`X:${TargetDisplayMinX} ~ ${TargetDisplayMaxX}`);
        console.log(`Y:${TargetDisplayMinY} ~ ${TargetDisplayMaxY}`);
        const TargetWindowLeftTopX=Math.max(TargetDisplayMinX,Math.min(TargetWindowBounds.x,TargetDisplayMaxX-TargetWindowBounds.width));
        const TargetWindowLeftTopY=Math.max(TargetDisplayMinY,Math.min(TargetWindowBounds.y,TargetDisplayMaxY-TargetWindowBounds.height));
        console.log(`Current Window Infomation ${WindowTarget}`);
        console.log(`X:${TargetWindowLeftTopX} ~ ${TargetWindowLeftTopX+TargetWindowBounds.width}`);
        console.log(`Y:${TargetWindowLeftTopY} ~ ${TargetWindowLeftTopY+TargetWindowBounds.height}`);
        TargetWindow.setPosition(TargetWindowLeftTopX,TargetWindowLeftTopY);
    }catch(e){
        console.log("WindowReisze Error!!");
        console.log(e);
    }
});
/*SubWindow関連のIPCハンドラ*/
//SubWindowを開くように命令する
function createSubWindow(SendingData){
    //const header=SendingData.get("header");
    const actionName=SendingData.get("action");
    const HTMLfileName=actionName+".html";
    const ReceivedDataBody=SendingData.get("data");
    const windowsize=ReceivedDataBody.get("windowsize");
    AllowAddOrDeleteFlag=ReceivedDataBody.get("AllowAddOrDeleteFlag");//サブウィンドウごとに設定された許可状態に変更
    //メインウィンドウの位置を取得する
    const MainWindow=WindowManager.get("MainWindow");
    const {x:MainWindowX,y:MainWindowY,width:MainWindowWidth}=MainWindow.getBounds();
    /*サブウィンドウの展開場所を調整*/
    let SubWindowLeftTopX=MainWindowX+MainWindowWidth;
    let SubWindowLeftTopY=MainWindowY;
    const SafetyOffset=15;//座標領域の端ぴったりでも異常ウィンドウの判定を受けたので、WorkAreaより少し狭いところに左上が来るようにする。
    const NearestDisplay=screen.getDisplayNearestPoint({x:SubWindowLeftTopX,y:SubWindowLeftTopY});
    const NearestDisplayWorkArea=NearestDisplay.workArea;
    console.log("SubWindowの左上が存在できる範囲",NearestDisplayWorkArea);
    const NearestDisplayMinX=NearestDisplayWorkArea.x;
    const NearestDisplayMaxX=NearestDisplayMinX+NearestDisplayWorkArea.width;
    const NearestDisplayMinY=NearestDisplayWorkArea.y;
    const NearestDisplayMaxY=NearestDisplayMinY+NearestDisplayWorkArea.height;
    //一番近いディスプレイの座標内に左上の点が含まれるようにする
    SubWindowLeftTopX=Math.max(NearestDisplayMinX+SafetyOffset,Math.min(SubWindowLeftTopX,NearestDisplayMaxX-SafetyOffset));
    SubWindowLeftTopY=Math.max(NearestDisplayMinY+SafetyOffset,Math.min(SubWindowLeftTopY,NearestDisplayMaxY-SafetyOffset));
    const SubWindow = new BrowserWindow({
        width: windowsize[0],
        height: windowsize[1],
        parent: MainWindow,//MainWindowとの親子関係を設定しておくことでMainWindowが表示されているディスプレイで表示されるようにする
        x: SubWindowLeftTopX,
        y: SubWindowLeftTopY,
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
    if(detach)SubWindow.webContents.openDevTools({mode: 'detach'});
    SubWindow.loadFile(path.join(__dirname,"SubWindows",actionName,HTMLfileName));
    //SubWindow.setAlwaysOnTop(true);どんなウィンドウよりも前面に表示する⇒parentの設定によってMainWindowの前だけにすることができたので不要
    /*SubWindowの準備が整ったらMultiUseLayerModeの可否の返答を受け取る*/
    SubWindow.webContents.once("did-finish-load",()=>{//HTMLなどの読み込みが終わったらサブウィンドウの初期化データを送る
        //初期化用の送信
        //console.log("SubWindow did-finish-load");
        SubWindow.webContents.send("initializeSubWindow",SendingData);
    });
    /*双方向通信経路の構築*/
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
        /*
        サブウィンドウに終了通告をすると、サブウィンドウからメインウィンドウに最後にやってほしい処理の連絡をする
        それを受け取ってメインウィンドウに連絡をしたのち、SubWindowを完全に閉じる
        */
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
        //データの追加・削除が許可できる状態であるかのフラグを許可状態に
        AllowAddOrDeleteFlag=true;
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
//MainWindowに、何かしらのSubWindowが開かれている状態か教える。
//SubWindowが開かれるとWindowManegerにSubWindowが登録され、消えるときにdeleteされることを利用してチェックしている。
ipcMain.handle("CheckAllowAddOrDelete",()=>{
    console.log("CheckAllowAddOrDelete");
    if(AllowAddOrDeleteFlag){
        console.log("Able to Add or Delete Data.")
    }else{
        console.log("Unable to Add or Delete Data.");
    }
    return AllowAddOrDeleteFlag;
});