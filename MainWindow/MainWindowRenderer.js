// eslint-disable-next-line no-undef
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;//ここの2つ関係ないかもしれない
// eslint-disable-next-line no-undef
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

// Disable web workers for simplest setup in Electron
// eslint-disable-next-line no-undef
cornerstoneWADOImageLoader.configure({ useWebWorkers: false });

//読み込んだデータの実態となる辞書型変数
//キャンバスの追加削除と共に編集される
//BGCTは読み込んだ後の処理が他と異なる。
//BGCTは一つしか読み込んでおけず、削除もできない。新しく読み込んで更新していく方針とする。
//Datatype,DataIDで{Data:DicomData,RefCount:x}にアクセスする
//Keyは読み込む優先順位の順に設定すること
/*
(CT,MASK)>DOSE>(MASKDIFF,CONTOUR)
*/
const DicomDataClassDictionary = new Map([["CT",new Map()],["MASK",new Map()],["MASKDIFF",new Map()],["DOSE",new Map()],["CONTOUR",new Map()]]);
const LayerBaseIndex=-3;
const LayerPriorityMap=new Map(Array.from(DicomDataClassDictionary.keys()).reverse().map((DataType,Index)=>[DataType,-3-Index]));
const DicomNextID = new Map(DicomDataClassDictionary.keys().map(key => [key, 0]));
//キャンバスに関する情報を管理するクラスをまとめた辞書型オブジェクト
const CanvasClassDictionary = new Map();
let CanvasNextID = 0;
const SVGNameSpace="http://www.w3.org/2000/svg";//普通にcreateElementでsvg要素を作るとHTMLの要素として作られてしまうため、名前空間を指定して作成する必要がある

//各データの読み込みクラス、必要な情報の保持
//CT&BGCT:シリーズデータ、ヒストグラム、i2zの紐づけ,getメソッド
//MASK:マスクデータ、不要ヒストグラム、i2zの紐づけ、getメソッド
//CONTOUR:RTStructデータ、BGCTのi2zの受け取り、getメソッド(現時点ではすべてのROIのiの輪郭を投げて、キャンバスの方で描画を制御する)
//loadedData=[{"name":filename.dcm,"ArrayBuffer":arraybuffer},...]のような形式で渡される
//フォルダを読み込んだものは長さがＮになり、ファイルを読み込んだものは長さが１になっているはず
function sortDicomFiles(fileList){
    /*ソート基準 ImagePositionPatientのZ座標 -> ファイル名のナンバリング -> InstanceNumber*/
    //console.log(fileList);
    return fileList.sort((a, b) => {
        const posA = a["dataset"].string("x00200032").split('\\')[2]; // ImagePositionPatientのZ座標を取得
        const posB = b["dataset"].string("x00200032").split('\\')[2];
        const zA=posA!==undefined ? parseFloat(posA) : null;
        const zB=posB!==undefined ? parseFloat(posB) : null;
        if (zA !== null && zB !== null) {
            return zB-zA; // Z座標でソート
        }
        // Z座標が同じ場合はファイル名でソート
        if(a["name"]!== b["name"]){
            console.log("名前ソート");
            return b["name"].localeCompare(a["name"],undefined,{numeric:true}); // ファイル名でソート
        }
        //InstanceNumberでソート
        const instA=parseInt(dataA.string("x00200013")||'0', 10);
        const instB=parseInt(dataB.string("x00200013")||'0', 10);
        console.log("InstanceNumberソート");
        return instB - instA; // InstanceNumberでソート
    });
}
function hsv2rgb(h, s=1, v=1) {
  // 引数処理
  h = (h < 0 ? h % 360 + 360 : h) % 360 / 60;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  v = v < 0 ? 0 : v > 1 ? 1 : v;

  // HSV to RGB 変換
  const c = [5, 3, 1].map(n =>
    Math.round((v - Math.max(0, Math.min(1, 2 - Math.abs(2 - (h + n) % 6))) * s * v) * 255));

  // 戻り値
  return {
    hex: `#${(c[0] << 16 | c[1] << 8 | c[2]).toString(16).padStart(6, '0')}`,
    rgb: c, r: c[0], g: c[1], b: c[2],
  };
}

//各データクラス
/*
Z方向：頭+　足-
Y方向：腹+　背中-
X方向：右+　左-
*/
class CTclass{
    /*
    静的メソッド
    1. 各データクラスにパス選択、
    2. データ読み込みチェック
    の機能を担わせる。
    1は、データタイプによってはディレクトリ、ファイルどちらを対象に選択するか、複数選択を可能とするかが異なる
    2は、データタイプによってデータ読み込み時に行う処理に固有性があるため、データクラス内に専用実装を行うことで、外部からは同様の手続きで扱えるようにする
    */
    static DataType="CT";
    static PathTarget="openDirectory";
    static DefaultMultiSelections="multiSelections";
    static {
        this.InitializePathSelectDOMTree();
    }
    //DOMTreeのパーツと必要なイベントの設定
    static InitializePathSelectDOMTree(){
        const PathSelectDOMTree=document.createElement("div");
        PathSelectDOMTree.id=this.DataType;//CSSで個別設定をするために必要になる
        PathSelectDOMTree.className="PathSelectDOMTree";
        /*DataTypeのタイトル欄*/
        const TitleDiv=document.createElement("div");
        TitleDiv.className="DataTypeDisplay";
        TitleDiv.textContent=`${this.DataType} の読み込み`;
        PathSelectDOMTree.appendChild(TitleDiv);
        /*パスの指定コンテナ*/
        const PathSettingContainer=document.createElement("div");
        PathSettingContainer.className="FilePathInputSettingContainer";//入力方法ごとのクラス名を設定する
        //1. modeセレクトボタン
        const ModeSelectContainer=document.createElement("div");
        ModeSelectContainer.className="ModeSelectContainer";
        const NewModeButton=document.createElement("button");
        NewModeButton.setAttribute("data-SelectMode","New");
        NewModeButton.textContent="新規";
        const ExistingModeButton=document.createElement("button");
        ExistingModeButton.setAttribute("data-SelectMode","Existing");
        ExistingModeButton.textContent="既存";
        ModeSelectContainer.appendChild(NewModeButton);
        ModeSelectContainer.appendChild(ExistingModeButton);
        PathSettingContainer.appendChild(ModeSelectContainer);
        //2. PathInputContainer
        const PathInputContainer=document.createElement("div");
        PathInputContainer.className="PathInputContainer";
        const NewPathContainer=document.createElement("div");
        NewPathContainer.classList.add("PathContainer");//パーツ名
        //NewPathContainer.classList.add("FilePathInput");//入力方法
        NewPathContainer.setAttribute("data-SelectMode","New");
        const NewPathInputText=document.createElement("input");
        NewPathInputText.className="NewPathInputText";
        NewPathInputText.type="text";
        NewPathInputText.placeholder="新しく読み込むデータのパスを入力...";
        const OpenFileDialogButton=document.createElement("button");
        OpenFileDialogButton.className="OpenFildDialogButton";
        OpenFileDialogButton.textContent="参照";
        OpenFileDialogButton.setAttribute("data-MultipleSelections",this.DefaultMultiSelections);//このDomに複数選択状態を設定しておくことでその都度切り替えられるようにする
        NewPathContainer.appendChild(NewPathInputText);
        NewPathContainer.appendChild(OpenFileDialogButton);
        PathInputContainer.appendChild(NewPathContainer);
        //既存のデータの参照を指定する部分。セレクターはこの時点では空としておき、起動時にoptionを設定する。
        //選択肢はCanvasIDとする(CanvasID＝？に映ってるCT画像をこっちのCanvasIDでも表示させたい、のようなイメージ)
        const ExistingPathContainer=document.createElement("div");
        ExistingPathContainer.classList.add("PathContainer");//パーツ名
        //ExistingPathContainer.classList.add("ExistingCanvasIDSelect");//入力方法
        ExistingPathContainer.setAttribute("data-SelectMode","Existing");
        const ExistingPathInputSelecter=document.createElement("select");
        ExistingPathInputSelecter.className="ExistingPathInputSelecter";
        ExistingPathContainer.appendChild(ExistingPathInputSelecter);
        PathInputContainer.appendChild(ExistingPathContainer);
        PathSettingContainer.appendChild(PathInputContainer);
        PathSelectDOMTree.appendChild(PathSettingContainer);
        //これはLoadAndLayoutなどから要請されて外部に渡したりする。
        //そのとき、ExistingPathInputSelecterのOptionを再構成して渡す
        this.OpenFileDialogButton=OpenFileDialogButton;//複数選択か単数選択かをセットしたり、確認する必要があるから
        this.ModeSelectContainer=ModeSelectContainer;//Selectedクラスの有無を確かめる必要があるから
        this.NewPathInputText=NewPathInputText;
        this.ExistingPathInputSelecter=ExistingPathInputSelecter;
        this.PathSelectDOMTree=PathSelectDOMTree;
        /*tabIndexを無効を設定する*/
        //Focus不可とする要素をまとめる
        const TabIndexTargetArray=[NewModeButton,ExistingModeButton,NewPathInputText,OpenFileDialogButton,ExistingPathInputSelecter];
        TabIndexTargetArray.forEach((element)=>element.tabIndex="-1");
        //console.dir(this.PathSelectDOMTree);
        /*OpenFileDialogButtonにイベントを設定する*/
        this.OpenFileDialogButton.addEventListener("mouseup",async (e)=>{
            if(e.button===0){//左クリックなら
                //属性値を取得
                const MultipleSelections=e.target.getAttribute("data-MultipleSelections");//"multipleSelections" or "" になるはず
                const PathTarget=this.PathTarget;
                const DialogTitle=`${this.DataType} 選択ダイアログ`;
                const SelectedPathList=await LoadAndLayout.SelectPathes(DialogTitle,PathTarget,MultipleSelections);//[]リストみたいな形式
                //SelectedPathListはリストで帰ってくることもあれば単一文字列で帰ってくることもあるが、showOpenDialogはかならず[filepath,...]の形式でパス文字列を返すのでfor文を回して良し
                /*
                ここではパスの選択は行うが読み込みはまだ行わない。現在読み込んだパスの配列を", "で結合してtextに表示する
                */
                this.NewPathInputText.value=SelectedPathList.join(", ");
            }
        });
        /*
        ModeSelectContainer内のボタンにイベントを付与
        */
        this.ModeSelectContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                const button=e.target;
                if(button.tagName==="BUTTON"){
                    //押されたbuttonにSelectedクラスが付与されているか
                    if(button.classList.contains("Selected")){
                        //押されているのでbuttonからSelectedを解除して、ModeSelectContainerのmode属性値を空白にする
                        button.classList.remove("Selected");
                        this.ModeSelectContainer.setAttribute("data-SelectMode","");
                    }else{
                        //まずは直下のbutton全てからSelectedを取り除く
                        const ButtonList=this.ModeSelectContainer.querySelectorAll(":scope>button");
                        ButtonList.forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        button.classList.add("Selected");
                        const modeAttribute=button.getAttribute("data-SelectMode");
                        this.ModeSelectContainer.setAttribute("data-SelectMode",modeAttribute);
                    }
                }
            }
        });
        /*
        PathInputContainerにクリックイベントを付与
        マウスダウン時にPathContainerまで辿っていく
        */
        PathInputContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //e.targetから親を辿る
                const PathContainer=e.target.closest("div.PathContainer");
                if(PathContainer){
                    const PathContainerSelectMode=PathContainer.getAttribute("data-SelectMode");
                    const ModeSelectContainerSelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
                    if(PathContainerSelectMode!==ModeSelectContainerSelectMode){
                        //変更する必要あり
                        this.ModeSelectContainer.querySelectorAll(":scope>button").forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        //PathContainerSelectModeと同じ属性値を持つButtonを取得
                        const SelectedButton=this.ModeSelectContainer.querySelector(`:scope>button[data-SelectMode="${PathContainerSelectMode}"]`);
                        if(SelectedButton){
                            SelectedButton.classList.add("Selected");
                            this.ModeSelectContainer.setAttribute("data-SelectMode",PathContainerSelectMode);
                        }
                    }
                }
            }
        });
        /*
        PathSelectDOMTree.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //クリックされたパスコンテナを取得
                const ClickedPathContainer=e.target.closest("div.PathContainer");
                //このパスコンテナのクラスリストをチェックして選択済みかどうか確認
                if(ClickedPathContainer.classList.contains("Selected")){
                    //既に選択されている状態で押されたことになるので、選択を解除する
                    ClickedPathContainer.classList.remove("Selected");
                }else{
                    //まずは全てのPathContainerからSelectedを解除
                    const PathContainerList=this.PathSelectDOMTree.querySelectorAll(":scope>div.PathContainer");
                    PathContainerList.forEach((PathContainer)=>{
                        PathContainer.classList.remove("Selected");
                    });
                    //クリックされたものだけSelected
                    ClickedPathContainer.classList.add("Selected");
                }
            }
        });
        */
    }
    //LoadAndLayoutにDOMTreeを渡す
    static setPathSelectDOMTree(TargetCanvasID=99999,MultipleSelections=this.DefaultMultiSelections){
        /*
        外部から要請を受けてDOMTreeを渡す。
        */
        //状況によって複数パス選択可能か否か変動するため、これが呼ばれるたびにOpenFileDialogのAttributeを更新する
        this.OpenFileDialogButton.setAttribute("data-MultipleSelections",MultipleSelections);
        //ExistingPathInputSelecterのOptionを更新する
        this.NewPathInputText.value="";
        this.ExistingPathInputSelecter.innerHTML="";//初期化
        const initialoption=document.createElement("option");
        initialoption.text="既にあるDataIDを選択...";
        initialoption.value=(-99999);
        initialoption.disabled=true;//選択不可
        initialoption.hidden=true;//選択肢から除外
        initialoption.selected=true;//初期表示
        //CanvasClassのthis.DataTypeをチェックしていく
        const fragment=document.createDocumentFragment();//仮想DOM
        fragment.appendChild(initialoption);
        const DataIDCanvasIDListMap=new Map();
        for(const [CanvasID,Canvas] of CanvasClassDictionary.entries()){
            if(Canvas.LayerDataMap.has(this.DataType)){
                const DataID=Canvas.LayerDataMap.get(this.DataType).get("DataID");
                /*
                const option=document.createElement("option");
                option.text=`DataID:${DataID}(CanvasID:${CanvasID}) ${Path}`;
                option.value=DataID;
                fragment.appendChild(option);
                */
                if(DataIDCanvasIDListMap.has(DataID)){
                    DataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    DataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
            }
        }
        for(const [DataID,CanvasIDList] of DataIDCanvasIDListMap){
            const option=document.createElement("option");
            option.text=`DataID: ${DataID} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            fragment.appendChild(option);
        }
        this.ExistingPathInputSelecter.appendChild(fragment);
        //ModeSelectContainerのSelectMode属性値とModeSelectButtonを初期化する
        this.ModeSelectContainer.setAttribute("data-SelectMode","");
        const ModeSelectButtonArray=this.ModeSelectContainer.querySelectorAll(":scope>button.Selected");
        for(const button of ModeSelectButtonArray){
            button.classList.remove("Selected");
        }
        return this.PathSelectDOMTree;
    }
    /*
    static makeInfoText(LoadPath){
        return LoadPath;
    }
    */

    static async DataLoader(loadPath){
        //CTclass用のパス読み込み静的関数
        //戻り値の形式はこのコンストラクターが受け付けるものとする
        const LoadingResult=await LoadAndLayout.LoadFiles(loadPath);
        return LoadingResult;//一度外部で読み込まれたかのチェックを受けてからコンストラクタに入る
    }

    static async Loading(LoadPathList=[]){
        /*
        makeInfoTextの戻り値と同じ形式のリスト(複数選択対応)を受け取る
        戻り値は
        [DataID,...,DataID]とする。
        複数選択された際、すべてのDataType,DataIDが完璧に読み込めた場合のみ戻り値を返し、
        一つでも不備がある場合はfalseを返すこととする。
        */
        if(LoadPathList.length==0){
            //console.log("選択されませんでした");
            return false;
        }else{
            const DataInfoList=[];
            for(const LoadPath of LoadPathList){
                const LoadedData=await this.DataLoader(LoadPath);
                if(LoadedData){//ちゃんと読み込めているか
                    const DataType=this.DataType;
                    const DicomData=new this(LoadPath,LoadedData);
                    const NewDataID=DicomNextID.get(DataType);
                    DicomNextID.set(DataType,NewDataID+1);
                    const DicomDataMap=new Map([
                        ["Data",DicomData],
                        ["RefCount",0]
                    ]);
                    DicomDataClassDictionary.get(DataType).set(NewDataID,DicomDataMap);
                    DataInfoList.push(NewDataID);
                }else{
                    return false;
                }
            }
            return DataInfoList;
        }
        
    }
    //LoadAndLayoutからデータの読み込みが命令された。データの差し替えや一括読み込みからの経路
    static async LoadingFromDialog(){
        /*
        ダイアログからの入力でがデータを読み込むラッパー
        戻り値はLoadingと同じ
        [[DataType,DataID],[DataType,DataID]...]とする。
        ダメなときはfalseを返す。
        受け取り側は
        CT:リスト or falseとなる感じ
        これをもとにDataInfoMapを作成⇒CanvasInstance.SetLayer()に渡す、という流れ
        */
        /*
        const SelectedPathContainer=this.PathSelectDOMTree.querySelector(":scope>div.PathContainer.Selected");
        if(SelectedPathContainer){
            const PathTypeSelect=SelectedPathContainer.getAttribute("data-Path");//NewPath or ExistingPath
            if(PathTypeSelect==="ExistingPath"){
                const SelectedCanvasID=parseInt(this.ExistingPathInputSelecter.value);
                if(SelectedCanvasID>=0){//誤クリックにより、PathContainerだけクリックされたことを想定
                    const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                    const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                    return [DataID];//Loadingの形式に合わせてある
                }
            }else if(PathTypeSelect=="NewPath"){
                //まずはダイアログからLoadingに渡せる形式の入力を作成する
                const PathText=this.NewPathInputText.value;
                const LoadPathList=PathText.split(", ");
                return this.Loading(LoadPathList);//[DataID,DataID]
            }
        }
        return false;
        */
        const SelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
        if(SelectMode==="Existing"){
            const DataID=parseInt(this.ExistingPathInputSelecter.value);
            if(DataID>=0){
                //const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                //const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                return [DataID];//Loadingの戻り値の形式に一致させる
            }
        }else if(SelectMode==="New"){
            const PathText=this.NewPathInputText.value;
            const LoadPathList=PathText.split(", ");
            const DataIDList=await this.Loading(LoadPathList);
            return DataIDList;
        }
        return false;
    }
    static ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap){
        /*
        変更前のPathのArrayが送られてくるので、それらを変更した新しいArrayを返す.
        DataTypeによっては使わない引数あり
        */
        //OldPathArrayに対してパターンがあるか確認する
        /*
        PatternTargetMap
        {
            {<x>:{Before:Pattern,After:Pattern},}
        }
        */
        //対象文字列を中間文字列に変換する
        const NewPathArray=[];
        for(let i=0;i<OldPathArray.length;i++){
            let Before2MiddlePath=OldPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const BeforePattern=BeforeAndAfterPatternMap.get("Before");
                Before2MiddlePath=Before2MiddlePath.replace(BeforePattern,MiddlePattern);
            }
            NewPathArray.push(Before2MiddlePath);
        }
        for(let i=0;i<NewPathArray.length;i++){
            let Middle2AfterPath=NewPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const AfterPattern=BeforeAndAfterPatternMap.get("After");
                Middle2AfterPath=Middle2AfterPath.replace(MiddlePattern,AfterPattern);
            }
            NewPathArray[i]=Middle2AfterPath;
        }
        return NewPathArray;
    }
    /*CT用のレイヤーを生成する*/
    static LayerZindex=LayerPriorityMap.get(this.DataType);
    static GetNewLayer(){
        const NewLayer=document.createElement("canvas");
        NewLayer.style.zIndex=this.LayerZindex;
        return NewLayer;
    }
    static SetUniqueFunctions(CanvasID){
        /*ここで変更を加えるオブジェクトにアクセス*/
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const FlagMap=CanvasInstance.FlagMap;
        const ContextMenuButtonContainer=CanvasInstance.ContextMenuButtonContainer;
        const FromMainProcessToMainFunctions=CanvasInstance.FromMainProcessToMainFunctions;

        const WindowingButton=document.createElement("button");
        WindowingButton.className="CT";//DataTypeをクラス名に持つ要素で絞り込みをして、それを表示するためのクラス名
        WindowingButton.textContent="CT 階調";
        WindowingButton.value=CanvasID;
        ContextMenuButtonContainer.appendChild(WindowingButton);
        //ボタンを押すとサブウィンドウが開く
        Canvas.EventSetHelper(CanvasID,WindowingButton,"mouseup",(e)=>{
            if(e.button===0){
                const CanvasID=parseInt(e.target.value);
                this.OpenWindowingSubWindow(CanvasID);
            }
        });
        FromMainProcessToMainFunctions.set("ChangeWindowing",(data)=>{
            this.ChangeWindowingFunction(data);
        });
    }
    static OpenWindowingSubWindow(CanvasID){
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const Layer="CT";
        const DataID=CanvasInstance.LayerDataMap.get(Layer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(Layer).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        const WindowSize=[400,300];
        const AllowAddOrDeleteFlag=false;
        const data=new Map([
            ["vMin",DicomDataInstance.vMin],
            ["vMax",DicomDataInstance.vMax],
            ["histgram",DicomDataInstance.histgram],

            ["windowsize",WindowSize],
            ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
            ["Layer",Layer],
            ["CanvasID",CanvasID]
        ]);
        const InitializeData=new Map([
            ["action","Windowing"],
            ["data",data],
        ]);
        Canvas.openSubWindow(InitializeData);
    }
    //サブウィンドウから階調幅が送られてきたときの動き
    static ChangeWindowingFunction(data){
        //console.log("関数の実態に到達");
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const TargetLayer=ReceivedDataBody.get("Layer");
        const DataType=TargetLayer;
        const DataID=CanvasInstance.LayerDataMap.get(TargetLayer).get("DataID");
        const DataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
        const DicomDataInstance=DataInfoMap.get("Data");
        /*
        DicomDataInstance.vMin=ReceivedDataBody.get("vMin");
        DicomDataInstance.vMax=ReceivedDataBody.get("vMax");
        */
        DicomDataInstance.ChangeWindowing(data);
        CanvasInstance.DrawStatus.set("regenerate",true);
        //console.log("あとは再描画だけ");
        CanvasInstance.Layerdraw(TargetLayer);
    }
    /*ここから下はインスタンスとしての動き*/
    constructor(loadPath,loadedData){
        this.Path=loadPath;//読み込みパス。これを読み込めばまた自身のデータを取得できる
        //このなかでシリーズデータを解析して必要な情報を抽出
        //console.log("CT data loaded:");
        //loadedDataのsort
        loadedData = sortDicomFiles(loadedData);//ここで各スライスファイいるのデータをZ座標が昇順となるようにソートしている。
        //まずはpixeldataを抽出しつつzとImagePositionPatientの紐づけ。また、患者座標系のx,y,zの境界値を取得する
        this.width=loadedData[0]["dataset"].uint16("x00280011");//cols
        this.height=loadedData[0]["dataset"].uint16("x00280010");//rows
        this.depth=loadedData.length;
        const sizePerSlice=this.width*this.height;
        //loadDataから３次元配列、ヒストグラム、zとImagePositionPatientの紐づけを行う
        this.i2p=new Map();
        this.p2i=new Map();
        this.ImageVolume=new Float32Array(sizePerSlice*this.depth);
        const histgram=new Map();//MASKのカラーマップ生成時の情報にも使える
        //console.log("Depth",this.depth);
        let vMin=Infinity,vMax=-Infinity;
        for(let z=0;z<this.depth;z++){
            const dataset=loadedData[z]["dataset"];
            const position=parseFloat(dataset.string("x00200032").split('\\')[2]);//患者座標系
            //console.log(z,position);
            this.i2p.set(z,position);//indexからｚ座標を取得
            this.p2i.set(position,z);//z座標からindexを取得
            const slope=parseFloat(dataset.string("x00281053")||"1");
            const intercept=parseFloat(dataset.string("x00281052")||"0");
            const bitsAllocated=dataset.uint16("x00280100");
            const isSigned=dataset.uint16("x00280103")===1;

            const pixelElement=dataset.elements.x7fe00010;
            const pixelBuffer=new DataView(dataset.byteArray.buffer,pixelElement.dataOffset,pixelElement.length);
            let getHUvalueFunction=null;
            /*
            if(bitsAllocated===16){
                if(isSigned){
                    getHUvalue=(pixelBuffer,i)=>{return pixelBuffer.getInt16(i*2,true)};
                }else{
                    getHUvalue=(pixelBuffer,i)=>{return pixelBuffer.getUint16(i*2,true)};
                }
            }else{
                getHUvalue=(pixelBuffer,i)=>{return pixelBuffer.getUint8(i)};
            }
            */
            //console.log(bitsAllocated);
            if(bitsAllocated===8){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt8(byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true);
                }
            }else if(bitsAllocated===16){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt16(2*byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint16(2*byte,true);
                }
            }else if(bitsAllocated===32){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt32(4*byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint32(4*byte,true);
                }
            }else{
                getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true)
            }
            //画素値を平坦配列に入れていく。このとき、一緒に出現画素の集計を行う
            for(let i=0;i<sizePerSlice;i++){
                const pixel=getHUvalueFunction(pixelBuffer,i);//undifined
                /*
                let pixel;
                if(bitsAllocated===16){
                    if(isSigned){
                        pixel=pixelBuffer.getInt16(i*2,true);
                    }else{
                        pixel=pixelBuffer.getUint16(i*2,true);
                    }
                }else{
                    pixel=pixelBuffer.getUint8(i);
                }
                */
                //console.log(pixel,slope,intercept);
                const value=pixel*slope+intercept;
                this.ImageVolume[z*sizePerSlice+i]=value;
                //valueの回数を取得、なければ0を取得。その後、インクリメントして再セット
                histgram.set(value,(histgram.get(value)||0)+1);
                if(value<vMin)vMin=value;
                if(value>vMax)vMax=value;
            }
        }
        //ヒストグラムをソートしておきたい
        this.histgram=new Map(
            [...histgram.entries()].sort((a,b)=>a[0]-b[0])
        );
        //座標系の境界値を取得
        const PixelSpacing=loadedData[0]["dataset"].string("x00280030")?.split('\\').map(parseFloat) || [1,1];
        const ySpacing=PixelSpacing[0];
        const xSpacing=PixelSpacing[1];
        const ipp0=loadedData[0]["dataset"].string("x00200032")?.split("\\").map(parseFloat);
        this.xMin=ipp0?ipp0[0]:0;
        this.xMax=this.xMin+(this.width-1)*xSpacing;
        this.yMin=ipp0?ipp0[1]:0;
        this.yMax=this.yMin+(this.height-1)*ySpacing;
        this.zMin=this.i2p.get(this.depth-1);
        this.zMax=this.i2p.get(0);
        this.imagesize=this.width*this.height;
        this.vMin=vMin;
        this.vMax=vMax;
        this.ySpacing=ySpacing;
        this.xSpacing=xSpacing;
        //console.log(vMin,"~",vMax);
        //一時保存用の変数
        this.currentImageBitmap=null;
        //p2iはPositionが昇順になるようにソートする。i2pはインデックスですでに昇順になっている。こいつはあくまでインデックスからポジションの逆引き用
    }
    async draw(canvas,DrawStatus){
        const ctx=canvas.getContext("2d");
        ctx.imageSmoothingEnabled=false;
        const dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        ctx.clearRect(0,0,dWidth,dHeight);
        //vMin,vMaxは階調時に変更され、そのあと再描画させることで反映される
        //console.log("呼ばれたよ");
        if(DrawStatus.get("regenerate")){
            if(this.currentImageBitmap){
                this.currentImageBitmap.close();
            }
            //新しいImageBitMapを作成して保持
            this.currentImageBitmap= await this.CreateImageBitmap(DrawStatus.get("index"));
            //console.log("Bitmap",this.currentImageBitmap);
            //DrawStatus.set("regenerate",false);
        }
        //保存されたImageBitMapを描画する
        if(this.currentImageBitmap){
            ctx.drawImage(
                this.currentImageBitmap,
                DrawStatus.get("w0"),DrawStatus.get("h0"),DrawStatus.get("width"),DrawStatus.get("height"),
                0,0,dWidth,dHeight
            );
        }
    }
    CreateImageBitmap(index){
        //console.log("CTクラスだよ");
        const scale=255/(this.vMax-this.vMin);
        const rgbArray=new Uint8ClampedArray(this.imagesize*4);
        for(let i=0;i<this.imagesize;i++){
            const baseindex=i*4;
            const value=Math.round((this.ImageVolume[index*this.imagesize+i]-this.vMin)*scale);
            rgbArray[baseindex]=value;//R
            rgbArray[baseindex+1]=value;//G
            rgbArray[baseindex+2]=value;//B
            rgbArray[baseindex+3]=255;//A
        }
        //console.log(this.width,this.height);
        const imageData=new ImageData(rgbArray,this.width,this.height);
        //console.log("imageData",imageData);
        return createImageBitmap(imageData);
    }
    ChangeWindowing(data){
        const ReceivedDataBody=data.get("data");
        this.vMin=ReceivedDataBody.get("vMin");
        this.vMax=ReceivedDataBody.get("vMax");
    }
}
class ColorMapforMASK{
    constructor(){
        this.colormap=null;
        this.label=[];
        this.currentcolornum=-999;
    }
    update(alpha=0.3){
        //最大マスク数を更新
        if(DicomDataClassDictionary.get("MASK").size>0){
            let maxrange=-Infinity;
            let range;
            for(const DicomDataInfoMap of DicomDataClassDictionary.get("MASK").values()){
                const MaskClass=DicomDataInfoMap.get("Data");
                range=MaskClass.vMax-MaskClass.vMin;
                if(range>maxrange)maxrange=range;
            }
            //マスク数*(rgba)の配列を作る
            const color_num=maxrange+1;
            if(this.currentcolornum!=color_num){//色の種類に変更があった
                this.colormap=new Array(4*(color_num));
                this.label=new Array(color_num);
                this.colormap[0]=0;
                this.colormap[1]=0;
                this.colormap[2]=0;
                this.colormap[3]=0;//黒は完全透過
                this.label[0]=`${0}`;
                for(let n=0;n<color_num-1;n++){
                    const startindex=4*(n+1);//黒がすでに入っているためその分ずらす
                    const h=n*(360/maxrange);
                    const rgb=hsv2rgb(h);
                    //RGBAを順番に入れていく
                    this.colormap[startindex]=rgb.r;
                    this.colormap[startindex+1]=rgb.g;
                    this.colormap[startindex+2]=rgb.b;
                    this.colormap[startindex+3]=Math.round(alpha*255);
                    this.label[n+1]=`${n+1}`;
                }
                //種類数を更新する;
                this.currentcolornum=color_num;
            }
        }
    }
    ChangeLabel(data){
        //labelarrayに入っている文字列を順番にlabelに入れていく
        //labelarrayの方が長い場合は、余分な部分は無視する
        //labelarrayの方が短い場合は、残りは数字で埋める
        //上記の処理はサブウィンドウ側が担うのでこちらが気にする必要はない
        const NewLabelArray=data.get("data").get("MaskLabel");//["Name1","Name2",...,]
        this.label=NewLabelArray;
    }
}
const colormapformask=new ColorMapforMASK();
class MASKclass{
    /*
    静的メソッド
    1. 各データクラスにパス選択、
    2. データ読み込みチェック
    の機能を担わせる。
    1は、データタイプによってはディレクトリ、ファイルどちらを対象に選択するか、複数選択を可能とするかが異なる
    2は、データタイプによってデータ読み込み時に行う処理に固有性があるため、データクラス内に専用実装を行うことで、外部からは同様の手続きで扱えるようにする
    */
    static DataType="MASK";
    static PathTarget="openDirectory";
    static DefaultMultiSelections="multiSelections";
    static {
        this.InitializePathSelectDOMTree();
    }
    //DOMTreeのパーツと必要なイベントの設定
    static InitializePathSelectDOMTree(){
        const PathSelectDOMTree=document.createElement("div");
        PathSelectDOMTree.id=this.DataType;//CSSで個別設定をするために必要になる
        PathSelectDOMTree.className="PathSelectDOMTree";
        /*DataTypeのタイトル欄*/
        const TitleDiv=document.createElement("div");
        TitleDiv.className="DataTypeDisplay";
        TitleDiv.textContent=`${this.DataType} の読み込み`;
        PathSelectDOMTree.appendChild(TitleDiv);
        /*パスの指定コンテナ*/
        const PathSettingContainer=document.createElement("div");
        PathSettingContainer.className="FilePathInputSettingContainer";
        //1. modeセレクトボタン
        const ModeSelectContainer=document.createElement("div");
        ModeSelectContainer.className="ModeSelectContainer";
        const NewModeButton=document.createElement("button");
        NewModeButton.setAttribute("data-SelectMode","New");
        NewModeButton.textContent="新規";
        const ExistingModeButton=document.createElement("button");
        ExistingModeButton.setAttribute("data-SelectMode","Existing");
        ExistingModeButton.textContent="既存";
        ModeSelectContainer.appendChild(NewModeButton);
        ModeSelectContainer.appendChild(ExistingModeButton);
        PathSettingContainer.appendChild(ModeSelectContainer);
        //2. PathInputContainer
        const PathInputContainer=document.createElement("div");
        PathInputContainer.className="PathInputContainer";
        const NewPathContainer=document.createElement("div");
        NewPathContainer.classList.add("PathContainer");//パーツ名
        //NewPathContainer.classList.add("FilePathInput");//入力方法
        NewPathContainer.setAttribute("data-SelectMode","New");
        const NewPathInputText=document.createElement("input");
        NewPathInputText.className="NewPathInputText";
        NewPathInputText.type="text";
        NewPathInputText.placeholder="新しく読み込むデータのパスを入力...";
        const OpenFileDialogButton=document.createElement("button");
        OpenFileDialogButton.className="OpenFildDialogButton";
        OpenFileDialogButton.textContent="参照";
        OpenFileDialogButton.setAttribute("data-MultipleSelections",this.DefaultMultiSelections);//このDomに複数選択状態を設定しておくことでその都度切り替えられるようにする
        NewPathContainer.appendChild(NewPathInputText);
        NewPathContainer.appendChild(OpenFileDialogButton);
        PathInputContainer.appendChild(NewPathContainer);
        //既存のデータの参照を指定する部分。セレクターはこの時点では空としておき、起動時にoptionを設定する。
        //選択肢はCanvasIDとする(CanvasID＝？に映ってるCT画像をこっちのCanvasIDでも表示させたい、のようなイメージ)
        const ExistingPathContainer=document.createElement("div");
        ExistingPathContainer.classList.add("PathContainer");//パーツ名
        //ExistingPathContainer.classList.add("ExistingCanvasIDSelect");//入力方法
        ExistingPathContainer.setAttribute("data-SelectMode","Existing");
        const ExistingPathInputSelecter=document.createElement("select");
        ExistingPathInputSelecter.className="ExistingPathInputSelecter";
        ExistingPathContainer.appendChild(ExistingPathInputSelecter);
        PathInputContainer.appendChild(ExistingPathContainer);
        PathSettingContainer.appendChild(PathInputContainer);
        PathSelectDOMTree.appendChild(PathSettingContainer);
        //これはLoadAndLayoutなどから要請されて外部に渡したりする。
        //そのとき、ExistingPathInputSelecterのOptionを再構成して渡す
        this.OpenFileDialogButton=OpenFileDialogButton;//複数選択か単数選択かをセットしたり、確認する必要があるから
        this.ModeSelectContainer=ModeSelectContainer;//Selectedクラスの有無を確かめる必要があるから
        this.NewPathInputText=NewPathInputText;
        this.ExistingPathInputSelecter=ExistingPathInputSelecter;
        this.PathSelectDOMTree=PathSelectDOMTree;
        /*tabIndexを無効を設定する*/
        //Focus可能な要素をまとめる
        const TabIndexTargetArray=[NewModeButton,ExistingModeButton,NewPathInputText,OpenFileDialogButton,ExistingPathInputSelecter];
        TabIndexTargetArray.forEach((element)=>element.tabIndex="-1");
        //console.dir(this.PathSelectDOMTree);
        /*OpenFileDialogButtonにイベントを設定する*/
        this.OpenFileDialogButton.addEventListener("mouseup",async (e)=>{
            if(e.button===0){//左クリックなら
                //属性値を取得
                const MultipleSelections=e.target.getAttribute("data-MultipleSelections");//"multipleSelections" or "" になるはず
                const PathTarget=this.PathTarget;
                const DialogTitle=`${this.DataType} 選択ダイアログ`;
                const SelectedPathList=await LoadAndLayout.SelectPathes(DialogTitle,PathTarget,MultipleSelections);//[]リストみたいな形式
                //SelectedPathListはリストで帰ってくることもあれば単一文字列で帰ってくることもあるが、showOpenDialogはかならず[filepath,...]の形式でパス文字列を返すのでfor文を回して良し
                /*
                ここではパスの選択は行うが読み込みはまだ行わない。現在読み込んだパスの配列を", "で結合してtextに表示する
                */
                this.NewPathInputText.value=SelectedPathList.join(", ");
            }
        });
        /*
        ModeSelectContainer内のボタンにイベントを付与
        */
        this.ModeSelectContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                const button=e.target;
                if(button.tagName==="BUTTON"){
                    //押されたbuttonにSelectedクラスが付与されているか
                    if(button.classList.contains("Selected")){
                        //押されているのでbuttonからSelectedを解除して、ModeSelectContainerのmode属性値を空白にする
                        button.classList.remove("Selected");
                        this.ModeSelectContainer.setAttribute("data-SelectMode","");
                    }else{
                        //まずは直下のbutton全てからSelectedを取り除く
                        const ButtonList=this.ModeSelectContainer.querySelectorAll(":scope>button");
                        ButtonList.forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        button.classList.add("Selected");
                        const modeAttribute=button.getAttribute("data-SelectMode");
                        this.ModeSelectContainer.setAttribute("data-SelectMode",modeAttribute);
                    }
                }
            }
        });
        /*
        PathInputContainerにクリックイベントを付与
        マウスダウン時にPathContainerまで辿っていく
        */
        PathInputContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //e.targetから親を辿る
                const PathContainer=e.target.closest("div.PathContainer");
                if(PathContainer){
                    const PathContainerSelectMode=PathContainer.getAttribute("data-SelectMode");
                    const ModeSelectContainerSelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
                    if(PathContainerSelectMode!==ModeSelectContainerSelectMode){
                        //変更する必要あり
                        this.ModeSelectContainer.querySelectorAll(":scope>button").forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        //PathContainerSelectModeと同じ属性値を持つButtonを取得
                        const SelectedButton=this.ModeSelectContainer.querySelector(`:scope>button[data-SelectMode="${PathContainerSelectMode}"]`);
                        if(SelectedButton){
                            SelectedButton.classList.add("Selected");
                            this.ModeSelectContainer.setAttribute("data-SelectMode",PathContainerSelectMode);
                        }
                    }
                }
            }
        });
        /*
        PathSelectDOMTree.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //クリックされたパスコンテナを取得
                const ClickedPathContainer=e.target.closest("div.PathContainer");
                //このパスコンテナのクラスリストをチェックして選択済みかどうか確認
                if(ClickedPathContainer.classList.contains("Selected")){
                    //既に選択されている状態で押されたことになるので、選択を解除する
                    ClickedPathContainer.classList.remove("Selected");
                }else{
                    //まずは全てのPathContainerからSelectedを解除
                    const PathContainerList=this.PathSelectDOMTree.querySelectorAll(":scope>div.PathContainer");
                    PathContainerList.forEach((PathContainer)=>{
                        PathContainer.classList.remove("Selected");
                    });
                    //クリックされたものだけSelected
                    ClickedPathContainer.classList.add("Selected");
                }
            }
        });
        */
    }
    //LoadAndLayoutにDOMTreeを渡す
    static setPathSelectDOMTree(TargetCanvasID=99999,MultipleSelections=this.DefaultMultiSelections){
        /*
        外部から要請を受けてDOMTreeを渡す。
        */
        //状況によって複数パス選択可能か否か変動するため、これが呼ばれるたびにOpenFileDialogのAttributeを更新する
        this.OpenFileDialogButton.setAttribute("data-MultipleSelections",MultipleSelections);
        //ExistingPathInputSelecterのOptionを更新する
        this.NewPathInputText.value="";
        this.ExistingPathInputSelecter.innerHTML="";//初期化
        const initialoption=document.createElement("option");
        initialoption.text="既にあるDataIDを選択...";
        initialoption.value=(-99999);
        initialoption.disabled=true;//選択不可
        initialoption.hidden=true;//選択肢から除外
        initialoption.selected=true;//初期表示
        //CanvasClassのthis.DataTypeをチェックしていく
        const fragment=document.createDocumentFragment();//仮想DOM
        fragment.appendChild(initialoption);
        const DataIDCanvasIDListMap=new Map();
        for(const [CanvasID,Canvas] of CanvasClassDictionary.entries()){
            if(Canvas.LayerDataMap.has(this.DataType)){
                const DataID=Canvas.LayerDataMap.get(this.DataType).get("DataID");
                /*
                const option=document.createElement("option");
                option.text=`DataID:${DataID}(CanvasID:${CanvasID}) ${Path}`;
                option.value=DataID;
                fragment.appendChild(option);
                */
                if(DataIDCanvasIDListMap.has(DataID)){
                    DataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    DataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
            }
        }
        for(const [DataID,CanvasIDList] of DataIDCanvasIDListMap){
            const option=document.createElement("option");
            option.text=`DataID: ${DataID} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            fragment.appendChild(option);
        }
        this.ExistingPathInputSelecter.appendChild(fragment);
        //ModeSelectButtonを初期化する
        this.ModeSelectContainer.setAttribute("data-SelectMode","");
        const ModeSelectButtonArray=this.ModeSelectContainer.querySelectorAll(":scope>button.Selected");
        for(const button of ModeSelectButtonArray){
            button.classList.remove("Selected");
        }
        return this.PathSelectDOMTree;
    }
    /*
    static makeInfoText(LoadPath){
        return LoadPath;
    }
    */

    static async DataLoader(loadPath){
        //CTclass用のパス読み込み静的関数
        //戻り値の形式はこのコンストラクターが受け付けるものとする
        const LoadingResult=await LoadAndLayout.LoadFiles(loadPath);
        return LoadingResult;//一度外部で読み込まれたかのチェックを受けてからコンストラクタに入る
    }

    static async Loading(LoadPathList=[]){
        /*
        makeInfoTextの戻り値と同じ形式のリスト(複数選択対応)を受け取る
        戻り値は
        [DataID,...,DataID]とする。
        複数選択された際、すべてのDataType,DataIDが完璧に読み込めた場合のみ戻り値を返し、
        一つでも不備がある場合はfalseを返すこととする。
        */
        if(LoadPathList.length==0){
            //console.log("選択されませんでした");
            return false;
        }else{
            const DataInfoList=[];
            for(const LoadPath of LoadPathList){
                const LoadedData=await this.DataLoader(LoadPath);
                if(LoadedData){//ちゃんと読み込めているか
                    const DataType=this.DataType;
                    const DicomData=new this(LoadPath,LoadedData);
                    const NewDataID=DicomNextID.get(DataType);
                    DicomNextID.set(DataType,NewDataID+1);
                    const DicomDataMap=new Map([
                        ["Data",DicomData],
                        ["RefCount",0]
                    ]);
                    DicomDataClassDictionary.get(DataType).set(NewDataID,DicomDataMap);
                    DataInfoList.push(NewDataID);
                }else{
                    return false;
                }
            }
            colormapformask.update();
            return DataInfoList;
        }
        
    }
    //LoadAndLayoutからデータの読み込みが命令された。データの差し替えや一括読み込みからの経路
    static async LoadingFromDialog(){
        /*
        ダイアログからの入力でがデータを読み込むラッパー
        戻り値はLoadingと同じ
        [[DataType,DataID],[DataType,DataID]...]とする。
        ダメなときはfalseを返す。
        受け取り側は
        CT:リスト or falseとなる感じ
        これをもとにDataInfoMapを作成⇒CanvasInstance.SetLayer()に渡す、という流れ
        */
        /*
        const SelectedPathContainer=this.PathSelectDOMTree.querySelector(":scope>div.PathContainer.Selected");
        if(SelectedPathContainer){
            const PathTypeSelect=SelectedPathContainer.getAttribute("data-Path");//NewPath or ExistingPath
            if(PathTypeSelect==="ExistingPath"){
                const SelectedCanvasID=parseInt(this.ExistingPathInputSelecter.value);
                if(SelectedCanvasID>=0){//誤クリックにより、PathContainerだけクリックされたことを想定
                    const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                    const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                    return [DataID];//Loadingの形式に合わせてある
                }
            }else if(PathTypeSelect=="NewPath"){
                //まずはダイアログからLoadingに渡せる形式の入力を作成する
                const PathText=this.NewPathInputText.value;
                const LoadPathList=PathText.split(", ");
                return this.Loading(LoadPathList);//[DataID,DataID]
            }
        }
        return false;
        */
        const SelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
        if(SelectMode==="Existing"){
            const DataID=parseInt(this.ExistingPathInputSelecter.value);
            if(DataID>=0){
                //const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                //const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                return [DataID];//Loadingの戻り値の形式に一致させる
            }
        }else if(SelectMode==="New"){
            const PathText=this.NewPathInputText.value;
            const LoadPathList=PathText.split(", ");
            const DataIDList=await this.Loading(LoadPathList);
            return DataIDList;
        }
        return false;
    }
    static ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap){
        /*
        変更前のPathのArrayが送られてくるので、それらを変更した新しいArrayを返す.
        DataTypeによっては使わない引数あり
        */
        const NewPathArray=[];
        for(let i=0;i<OldPathArray.length;i++){
            let Before2MiddlePath=OldPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const BeforePattern=BeforeAndAfterPatternMap.get("Before");
                Before2MiddlePath=Before2MiddlePath.replace(BeforePattern,MiddlePattern);
            }
            NewPathArray.push(Before2MiddlePath);
        }
        for(let i=0;i<NewPathArray.length;i++){
            let Middle2AfterPath=NewPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const AfterPattern=BeforeAndAfterPatternMap.get("After");
                Middle2AfterPath=Middle2AfterPath.replace(MiddlePattern,AfterPattern);
            }
            NewPathArray[i]=Middle2AfterPath;
        }
        return NewPathArray;
    }
    /*適したレイヤーを生成する*/
    static LayerZindex=LayerPriorityMap.get(this.DataType);
    static GetNewLayer(){
        const NewLayer=document.createElement("canvas");
        NewLayer.style.zIndex=this.LayerZindex;
        return NewLayer;
    }
    static SetUniqueFunctions(CanvasID){
        /*ここで変更を加えるオブジェクトにアクセス*/
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const FlagMap=CanvasInstance.FlagMap;
        const ContextMenuButtonContainer=CanvasInstance.ContextMenuButtonContainer;
        const FromMainProcessToMainFunctions=CanvasInstance.FromMainProcessToMainFunctions;
        const CanvasBlock=CanvasInstance.CanvasBlock;

        const MaskModifingButton=document.createElement("button");
        MaskModifingButton.className="MASK";//DataTypeをクラス名に持つ要素で絞り込みをして、それを表示するためのクラス名
        MaskModifingButton.textContent="MASK 修正";
        MaskModifingButton.value=CanvasID;
        ContextMenuButtonContainer.appendChild(MaskModifingButton);
        //ボタンを押すとサブウィンドウが開く
        Canvas.EventSetHelper(CanvasID,MaskModifingButton,"mouseup",(e)=>{
            if(e.button===0){
                const CanvasID=parseInt(e.target.value);
                this.OpenMaskModifingSubWindow(CanvasID);
            }
        });
        //FlagMapにMASKClickモード用のフラグを追加
        FlagMap.set("MASKClick",new Map([["Flag",false],["Func",this.MASKClickFlagFunction]]));
        //マスククリックモードを有効化する/無効化するための関数を登録
        FromMainProcessToMainFunctions.set("MASKClickModeSwitching",(data)=>{
            this.MASKClickModeSwitchingFunction(data);
        });
        Canvas.EventSetHelper(CanvasID,CanvasBlock,"mousedown",(e)=>{
            if(e.button===0){
                const CanvasBlock=e.target.closest("div.CanvasBlock");
                const CanvasID=parseInt(CanvasBlock.getAttribute("data-CanvasID"));
                this.MASKClickedFunction(CanvasID);
            }
        });
        //サブウィンドウからのマスク変更命令を受け取る関数を登録
        FromMainProcessToMainFunctions.set("ChangeMask",(data)=>{
            this.ChangeMaskFunction(data);
        });
        //サブウィンドウからのラベル変更命令を受け取る関数を登録
        FromMainProcessToMainFunctions.set("ChangeLabel",(data)=>{
            this.ChangeLabelFunction(data);
        });
    }
    static OpenMaskModifingSubWindow(CanvasID){
        const Layer=this.DataType;
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const DataID=CanvasInstance.LayerDataMap.get(Layer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(Layer).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        const windowsize=[300,400];
        const AllowAddOrDeleteFlag=false;
        const SelectedAreaStatus=CanvasInstance.SelectedAreaStatus;
        const SelectedArea=new Map([
            //初期表示用の値を送る
            ["w0",SelectedAreaStatus.get("w0")],
            ["h0",SelectedAreaStatus.get("h0")],
            ["width",SelectedAreaStatus.get("width")],
            ["height",SelectedAreaStatus.get("height")],
            ["startslice",SelectedAreaStatus.get("startslice")],
            ["endslice",SelectedAreaStatus.get("endslice")],
        ]);
        const data=new Map([
            //ユーザーが選択範囲を手入力で変更する際、範囲境界の判定に使う
            ["originalimagewidth",SelectedAreaStatus.get("originalimagewidth")],
            ["originalimageheight",SelectedAreaStatus.get("originalimageheight")],
            ["originalslidermax",SelectedAreaStatus.get("originalslidermax")],
            ["SelectedArea",SelectedArea],
            //修正対象選択用に使う
            ["histgram",DicomDataInstance.histgram],//ヒストグラムのkeys()はイテレータとなっており、これが送れないみたい
            ["colormap",colormapformask.colormap],//カラーマップの本体だけ送る。クラスインスタンスは構造化オブジェクトじゃないらしいから送れない
            ["MaskLabel",colormapformask.label],

            ["windowsize",windowsize],
            ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
            ["Layer",Layer],
            ["CanvasID",CanvasID],
        ]);
        const initializedata=new Map([
            ["action","MaskModifing"],
            ["data",data],
        ]);
        Canvas.openSubWindow(initializedata);
    }
    static MASKClickFlagFunction(CanvasInstance){
        /*
        if(this.MultiUseLayerModeFlagSet.has("MASKClick")&&this.mouseenter&&!ZoomPanKeyPressed){
            this.MASKClickFlag=true;
        }else{
            this.MASKClickFlag=false;
        }
        */
        const MultiUseLayerModeFlag=CanvasInstance.MultiUseLayerModeFlagSet.has("MASKClick");
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        return MultiUseLayerModeFlag&&CanvasInstance.mouseenter&&!ZoomPanKeyPressedFlag;
    }
    static MASKClickModeSwitchingFunction(data){
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const Activate=ReceivedDataBody.get("Activate");
        const ModeFlagName="MASKClick";
        console.log("MASKClickModeSwitchingFunction:",Activate);
        if(Activate){
            CanvasInstance.MultiUseLayerModeFlagSet.add(ModeFlagName);
        }else{
            CanvasInstance.MultiUseLayerModeFlagSet.delete(ModeFlagName);
        }
        CanvasInstance.FlagUpdater();
    }
    static MASKClickedFunction(CanvasID){
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const MASKClickFlag=CanvasInstance.FlagMap.get("MASKClick").get("Flag");
        if(MASKClickFlag&&CanvasInstance.LayerDataMap.has("MASK")){
            const MouuseTrack=CanvasInstance.MouseTrack;
            const NewX=MouuseTrack.get("current").get("x");
            const NewY=MouuseTrack.get("current").get("y");
            const Rect=CanvasInstance.CanvasBlock.getBoundingClientRect();
            const DrawStatus=CanvasInstance.DrawStatus;
            const Currentw0=DrawStatus.get("w0");
            const Currenth0=DrawStatus.get("h0");
            const Currentwidth=DrawStatus.get("width");
            const Currentheight=DrawStatus.get("height");
            const CurrentIndex=DrawStatus.get("index");
            //現在描画領域を考慮した座標を計算
            const ClickedPointX=Currentwidth*(NewX/Rect.width)+Currentw0;
            const ClickedPointY=Currentheight*(NewY/Rect.height)+Currenth0;
            //Maskclassに判定依頼、その場所のMaskValueが返ってくる
            const LayerData=CanvasInstance.LayerDataMap.get("MASK");
            const DataID=LayerData.get("DataID");
            const DicomDataInstance=DicomDataClassDictionary.get("MASK").get(DataID).get("Data");
            const ClickedMaskValue=DicomDataInstance.getClickedMASKValue(CurrentIndex,ClickedPointX,ClickedPointY);
            const data=new Map([
                ["action","MASKClicked"],
                ["data",new Map([
                    ["CanvasID",CanvasID],
                    ["ClickedMASKValue",ClickedMaskValue]
                ])]
            ]);
            Canvas.PassChangesToSubWindow(data);
        }
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            if(this.MASKClickFlag&&this.LayerDataMap.has("MASK")&&e.button===0){
                //console.log("ROIClicked!!");
                //現在のZoomPan状態を考慮した画像座標を取得する
                const newX=this.MouseTrack.get("current").get("x");
                const newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                const currentw0=this.DrawStatus.get("w0");
                const currenth0=this.DrawStatus.get("h0");
                const currentwidth=this.DrawStatus.get("width");
                const currentheight=this.DrawStatus.get("height");
                const currentIndex=this.DrawStatus.get("index");
                //現在描画領域を考慮した座標を計算
                const ClickedPointX=currentwidth*(newX/rect.width)+currentw0;
                const ClickedPointY=currentheight*(newY/rect.height)+currenth0;
                //Maskclassに判定依頼、その場所のMaskValueが返ってくる
                const LayerData=this.LayerDataMap.get("MASK");
                const TargetDataID=LayerData.get("DataID");
                const TargetDicomDataClass=DicomDataClassDictionary.get("MASK").get(TargetDataID).get("Data");
                const ClickedMaskValue=TargetDicomDataClass.getClickedMASKValue(currentIndex,ClickedPointX,ClickedPointY);
                const data=new Map([
                    ["action","MASKClicked"],
                    ["data",new Map([
                        ["ClickedMASKValue",ClickedMaskValue]
                    ])]
                ]);
                this.PassChangesToSubWindow(data);
            }
        });
    }
    static ChangeMaskFunction(data){
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const TargetLayer=ReceivedDataBody.get("Layer");
        const DataType=TargetLayer;
        const DataID=CanvasInstance.LayerDataMap.get(TargetLayer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        DicomDataInstance.ChangeMask(data);
        CanvasInstance.Layerdraw(TargetLayer);
    }
    static ChangeLabelFunction(data){
        colormapformask.ChangeLabel(data);
    }
    /*ここから下はインスタンスとしての動き*/
    constructor(loadPath,loadedData){
        this.Path=loadPath;
        //このなかでシリーズデータを解析して必要な情報を抽出
        //console.log("MASK data loaded:");
        //loadedDataのsort
        loadedData = sortDicomFiles(loadedData);
        //まずはpixeldataを抽出しつつzとImagePositionPatientの紐づけ。また、患者座標系のx,y,zの境界値を取得する
        this.width=loadedData[0]["dataset"].uint16("x00280011");//cols
        this.height=loadedData[0]["dataset"].uint16("x00280010");//rows
        this.depth=loadedData.length;
        const sizePerSlice=this.width*this.height;
        //loadDataから３次元配列、ヒストグラム、zとImagePositionPatientの紐づけを行う
        this.i2p=new Map();
        this.p2i=new Map();
        this.ImageVolume=new Float32Array(sizePerSlice*this.depth);
        const histgram=new Map();//MASKのカラーマップ生成時の情報にも使える
        //console.log("Depth",this.depth);
        let vMin=Infinity,vMax=-Infinity;
        for(let z=0;z<this.depth;z++){
            const dataset=loadedData[z]["dataset"];
            const position=parseFloat(dataset.string("x00200032").split('\\')[2]);//患者座標系
            this.i2p.set(z,position);//indexからｚ座標を取得
            this.p2i.set(position,z);//z座標からindexを取得
            const slope=parseFloat(dataset.string("x00281053")||"1");
            const intercept=parseFloat(dataset.string("x00281052")||"0");
            const bitsAllocated=dataset.uint16("x00280100");
            const isSigned=dataset.uint16("x00280103")===1;

            const pixelElement=dataset.elements.x7fe00010;
            const pixelBuffer=new DataView(dataset.byteArray.buffer,pixelElement.dataOffset,pixelElement.length);
            let getHUvalueFunction=null;
            if(bitsAllocated===8){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt8(byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true);
                }
            }else if(bitsAllocated===16){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt16(2*byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint16(2*byte,true);
                }
            }else if(bitsAllocated===32){
                if(isSigned){
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt32(4*byte,true);
                }else{
                    getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint32(4*byte,true);
                }
            }else{
                getHUvalueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true)
            }
            //画素値を平坦配列に入れていく。このとき、一緒に出現画素の集計を行う
            for(let i=0;i<sizePerSlice;i++){
                const pixel=getHUvalueFunction(pixelBuffer,i);//undifined
                /*
                let pixel;
                if(bitsAllocated===16){
                    if(isSigned){
                        pixel=pixelBuffer.getInt16(i*2,true);
                    }else{
                        pixel=pixelBuffer.getUint16(i*2,true);
                    }
                }else{
                    pixel=pixelBuffer.getUint8(i);
                }
                */
                //console.log(pixel,slope,intercept);
                const value=pixel*slope+intercept;
                this.ImageVolume[z*sizePerSlice+i]=value;
                //valueの回数を取得、なければ0を取得。その後、インクリメントして再セット
                histgram.set(value,(histgram.get(value)||0)+1);
                if(value<vMin)vMin=value;
                if(value>vMax)vMax=value;
            }
        }
        //ヒストグラムをソートしておきたい
        this.histgram=new Map(
            [...histgram.entries()].sort((a,b)=>a[0]-b[0])
        );
        //座標系の境界値を取得
        const PixelSpacing=loadedData[0]["dataset"].string("x00280030")?.split('\\').map(parseFloat) || [1,1];
        const ySpacing=PixelSpacing[0];
        const xSpacing=PixelSpacing[1];
        const ipp0=loadedData[0]["dataset"].string("x00200032")?.split("\\").map(parseFloat);
        this.xMin=ipp0?ipp0[0]:0;
        this.xMax=this.xMin+(this.width-1)*xSpacing;
        this.yMin=ipp0?ipp0[1]:0;
        this.yMax=this.yMin+(this.height-1)*ySpacing;
        this.zMin=this.i2p.get(this.depth-1);
        this.zMax=this.i2p.get(0);
        this.imagesize=this.width*this.height;
        this.vMin=vMin;
        this.vMax=vMax;
        this.ySpacing=ySpacing;
        this.xSpacing=xSpacing;
        //console.log(vMin,"~",vMax);
        //一時保存用の変数
        this.currentImageBitmap=null;
        //境界となっているピクセルのインデックスの集合
        this.ContourIndexSet=new Set();
        this.UpdateContourIndexSet(0,this.depth-1,0,this.height,0,this.width);//全域に対してチェック
    }
    async draw(canvas,DrawStatus){
        const ctx=canvas.getContext("2d");
        ctx.imageSmoothingEnabled=false;
        const dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        ctx.clearRect(0,0,dWidth,dHeight);
        //vMin,vMaxは階調時に変更され、そのあと再描画させることで反映される
        if(DrawStatus.get("regenerate")){
            if(this.currentImageBitmap){
                this.currentImageBitmap.close();
            }
            //新しいImageBitMapを作成して保持
            this.currentImageBitmap= await this.CreateImageBitmap(DrawStatus.get("index"));
            //console.log("Bitmap",this.currentImageBitmap);
            //DrawStatus.set("regenerate",false);
        }
        //保存されたImageBitMapを描画する
        if(this.currentImageBitmap){
            ctx.drawImage(
                this.currentImageBitmap,
                DrawStatus.get("w0"),DrawStatus.get("h0"),DrawStatus.get("width"),DrawStatus.get("height"),
                0,0,dWidth,dHeight
            );
        }
    }
    CreateImageBitmap(z){
        //MASK、CONTOUR用のカラーマップを作成する必要がある。
        const rgbArray=new Uint8ClampedArray(this.imagesize*4);
        for(let i=0;i<this.imagesize;i++){
            const baseindex=i*4;
            const VolumeIndex=z*this.imagesize+i;
            const value=Math.round((this.ImageVolume[VolumeIndex]-this.vMin));
            const ColorMapBaseIndex=4*value;
            rgbArray[baseindex]=colormapformask.colormap[ColorMapBaseIndex];//R
            rgbArray[baseindex+1]=colormapformask.colormap[ColorMapBaseIndex+1];//G
            rgbArray[baseindex+2]=colormapformask.colormap[ColorMapBaseIndex+2];//B
            rgbArray[baseindex+3]=colormapformask.colormap[ColorMapBaseIndex+3];//A
            if(this.ContourIndexSet.has(VolumeIndex)){
                //境界にあたるので濃い目に表示
                rgbArray[baseindex+3]+=76//255*0.3=76.5
            }
        }
        const imageData=new ImageData(rgbArray,this.width,this.height);
        //console.log("imageData",imageData);
        return createImageBitmap(imageData);
    }
    getClickedMASKValue(Z,X,Y){
        //X,Yは整数じゃないことがほとんどであるため、四捨五入により整数化する
        const WidthSize=this.width;
        const HeightSize=this.height;
        //万が一範囲外の値が渡されたときのための境界処理
        const IntX=Math.max(0,Math.min(Math.round(X),WidthSize));
        const IntY=Math.max(0,Math.min(Math.round(Y),HeightSize));
        const index=Z*WidthSize*HeightSize+IntY*WidthSize+IntX;
        const ClickedMaskValue=this.ImageVolume[index];
        return ClickedMaskValue;
    }
    /*Maskの一部を変更する*/
    ChangeMask(data){
        //console.log("ChangeMask in MASKclass");
        const ChangeData=data.get("data").get("MaskChangeData");
        //const {w0,h0,width,height,startslice,endslice,MaskA,MaskB}=ChangeData;
        const w0=ChangeData.get("w0");
        const h0=ChangeData.get("h0");
        const width=ChangeData.get("width");
        const height=ChangeData.get("height");
        const startslice=ChangeData.get("startslice");
        const endslice=ChangeData.get("endslice");
        const ChangeMaskMap=ChangeData.get("ChangeMaskMap");//{BeforeMaskValue:AfterMaskValue,...,}
        //console.log(w0,h0,width,height,startslice,endslice,MaskA,MaskB);
        /*
        slice:startslife~endsliceの範囲
        x:w0~w0+width-1
        y:h0~h0+height-1
        これをもとに一次元配列時のインデックスを算出し、MaskAに該当すればMaskBに変更する
        */
        const WidthSize=this.width;
        const HeightSize=this.height;
        //const DepthSize=this.depth;
        let index=null;
        let counter=0;
        for(let z=startslice;z<=endslice;z++){
            //index=z;//0*Z+z
            for(let h=h0;h<h0+height;h++){
                //index=index*HeightSize+h;
                for(let w=w0;w<w0+width;w++){
                    //index=index*WidthSize+w;
                    index=z*WidthSize*HeightSize+h*WidthSize+w;
                    /*
                    if(this.ImageVolume[index]==MaskA){
                        //console.log("Change",z,h,w,index);
                        this.ImageVolume[index]=MaskB;
                        counter++;
                    }
                    */
                    const BeforeMaskValue=this.ImageVolume[index];
                    if(ChangeMaskMap.has(BeforeMaskValue)){//現在の位置の値が対象として登録されていれば
                        const AfterMaskValue=ChangeMaskMap.get(BeforeMaskValue);
                        this.ImageVolume[index]=AfterMaskValue;
                        counter++;
                    }
                }
            }
        }
        //境界点集合の更新
        this.UpdateContourIndexSet(startslice,endslice,h0,height,w0,width);
        if(counter==0){
            console.log(ChangeMaskMap,"変更箇所なし");
        }
    }
    UpdateContourIndexSet(startslice,endslice,h0,height,w0,width){
        const NeiborOffsetArray=[[-1,0],[1,0],[0,-1],[0,1]];
        //インデックスが許される範囲
        //選択された領域の+-1の範囲に対して輪郭チェックを粉う必要がある。
        //選択された領域の外側の画素にとっては、変更によって隣に違うマスクが来る可能性があるから
        const starth=Math.max(0,h0-1);
        const endh=Math.min(this.height-1,(h0+height-1)+1);
        const startw=Math.max(0,w0-1);
        const endw=Math.min(this.width-1,(w0+width-1)+1);
        for(let z=startslice;z<=endslice;z++){
            for(let h=starth;h<=endh;h++){
                for(let w=startw;w<=endw;w++){
                    const FocusIndex=(z*this.height+h)*this.width+w;
                    const FocusMaskValue=this.ImageVolume[FocusIndex];
                    ////この座標が境界点集合にあるか確認し、あれば一旦リセットする
                    this.ContourIndexSet.delete(FocusIndex);
                    if(FocusMaskValue!==0){//BGではないなら境界点かチェックする
                        if((h===0||h===this.height-1)||(w===0||w===this.width-1)){
                            //画像の端に位置するピクセルであり、かならず境界点となる
                            this.ContourIndexSet.add(FocusIndex);
                        }else{
                            for(const [HOffset,WOffset] of NeiborOffsetArray){
                                const NeiborH=h+HOffset;
                                const NeiborW=w+WOffset;
                                const NeiborIndex=(z*this.height+NeiborH)*this.width+NeiborW;
                                const NeiborMaskValue=this.ImageVolume[NeiborIndex];
                                if(FocusMaskValue!==NeiborMaskValue){
                                    //境界点となるので集合に追加
                                    this.ContourIndexSet.add(FocusIndex);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
class MASKDIFFclass{
    /*
    静的メソッド
    1. 各データクラスにパス選択、
    2. データ読み込みチェック
    の機能を担わせる。
    1は、データタイプによってはディレクトリ、ファイルどちらを対象に選択するか、複数選択を可能とするかが異なる
    2は、データタイプによってデータ読み込み時に行う処理に固有性があるため、データクラス内に専用実装を行うことで、外部からは同様の手続きで扱えるようにする
    */
    static DataType="MASKDIFF";
    static PathTarget="openDirectory";
    static DefaultMultiSelections="";
    static DataIDDataIDDelimita=`<|${this.DataType}|>`;//DataIDvsDataID
    static {
        this.InitializePathSelectDOMTree();
    }
    //DOMTreeのパーツと必要なイベントの設定
    static InitializePathSelectDOMTree(){
        const PathSelectDOMTree=document.createElement("div");
        PathSelectDOMTree.id=this.DataType;//CSSで個別設定をするために必要になる
        PathSelectDOMTree.className="PathSelectDOMTree";
        /*DataTypeのタイトル欄*/
        const TitleDiv=document.createElement("div");
        TitleDiv.className="DataTypeDisplay";
        TitleDiv.textContent=`${this.DataType} の読み込み`;
        PathSelectDOMTree.appendChild(TitleDiv);
        /*パスの指定コンテナ*/
        const PathSettingContainer=document.createElement("div");
        PathSettingContainer.className="ComparableCanvasIDSelectSettingContainer";
        //1. modeセレクトボタン
        const ModeSelectContainer=document.createElement("div");
        ModeSelectContainer.className="ModeSelectContainer";
        const NewModeButton=document.createElement("button");
        NewModeButton.setAttribute("data-SelectMode","New");
        NewModeButton.textContent="新規";
        const ExistingModeButton=document.createElement("button");
        ExistingModeButton.setAttribute("data-SelectMode","Existing");
        ExistingModeButton.textContent="既存";
        ModeSelectContainer.appendChild(NewModeButton);
        ModeSelectContainer.appendChild(ExistingModeButton);
        PathSettingContainer.appendChild(ModeSelectContainer);
        //2. PathInputContainer
        const PathInputContainer=document.createElement("div");
        PathInputContainer.className="PathInputContainer";
        const NewPathContainer=document.createElement("div");
        NewPathContainer.classList.add("PathContainer");//パーツ名
        //NewPathContainer.classList.add("ComparableCanvasIDSelect");//入力方法
        NewPathContainer.setAttribute("data-SelectMode","New");
        const Input1Selecter=document.createElement("select");
        const SeparateDiv=document.createElement("div");
        SeparateDiv.textContent="VS";
        const Input2Selecter=document.createElement("select");
        NewPathContainer.appendChild(Input1Selecter);
        NewPathContainer.appendChild(SeparateDiv);
        NewPathContainer.appendChild(Input2Selecter);
        PathInputContainer.appendChild(NewPathContainer);
        //既存のデータの参照を指定する部分。セレクターはこの時点では空としておき、起動時にoptionを設定する。
        //選択肢はCanvasIDとする(CanvasID＝？に映ってるCT画像をこっちのCanvasIDでも表示させたい、のようなイメージ)
        const ExistingPathContainer=document.createElement("div");
        ExistingPathContainer.classList.add("PathContainer");//パーツ名
        //ExistingPathContainer.classList.add("ExistingCanvasIDSelect");//入力方法
        ExistingPathContainer.setAttribute("data-SelectMode","Existing");
        const ExistingPathInputSelecter=document.createElement("select");
        ExistingPathInputSelecter.className="ExistingPathInputSelecter";
        ExistingPathContainer.appendChild(ExistingPathInputSelecter);
        PathInputContainer.appendChild(ExistingPathContainer);
        PathSettingContainer.appendChild(PathInputContainer);
        PathSelectDOMTree.appendChild(PathSettingContainer);
        /*tabIndexを無効を設定する*/
        //Focus可能な要素をまとめる
        const TabIndexTargetArray=[NewModeButton,ExistingModeButton,Input1Selecter,Input2Selecter,ExistingPathInputSelecter];
        TabIndexTargetArray.forEach((element)=>element.tabIndex="-1");
        //これはLoadAndLayoutなどから要請されて外部に渡したりする。
        //そのとき、ExistingPathInputSelecterのOptionを再構成して渡す
        this.ModeSelectContainer=ModeSelectContainer;//Selectedクラスの有無を確かめる必要があるから
        this.Input1Selecter=Input1Selecter;
        this.Input2Selecter=Input2Selecter;
        this.ExistingPathInputSelecter=ExistingPathInputSelecter;
        this.PathSelectDOMTree=PathSelectDOMTree;
        //console.dir(this.PathSelectDOMTree);
        /*
        ModeSelectContainer内のボタンにイベントを付与
        */
        this.ModeSelectContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                const button=e.target;
                if(button.tagName==="BUTTON"){
                    //押されたbuttonにSelectedクラスが付与されているか
                    if(button.classList.contains("Selected")){
                        //押されているのでbuttonからSelectedを解除して、ModeSelectContainerのmode属性値を空白にする
                        button.classList.remove("Selected");
                        this.ModeSelectContainer.setAttribute("data-SelectMode","");
                    }else{
                        //まずは直下のbutton全てからSelectedを取り除く
                        const ButtonList=this.ModeSelectContainer.querySelectorAll(":scope>button");
                        ButtonList.forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        button.classList.add("Selected");
                        const modeAttribute=button.getAttribute("data-SelectMode");
                        this.ModeSelectContainer.setAttribute("data-SelectMode",modeAttribute);
                    }
                }
            }
        });
        /*
        PathInputContainerにクリックイベントを付与
        マウスダウン時にPathContainerまで辿っていく
        */
        PathInputContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //e.targetから親を辿る
                const PathContainer=e.target.closest("div.PathContainer");
                if(PathContainer){
                    const PathContainerSelectMode=PathContainer.getAttribute("data-SelectMode");
                    const ModeSelectContainerSelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
                    if(PathContainerSelectMode!==ModeSelectContainerSelectMode){
                        //変更する必要あり
                        this.ModeSelectContainer.querySelectorAll(":scope>button").forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        //PathContainerSelectModeと同じ属性値を持つButtonを取得
                        const SelectedButton=this.ModeSelectContainer.querySelector(`:scope>button[data-SelectMode="${PathContainerSelectMode}"]`);
                        if(SelectedButton){
                            SelectedButton.classList.add("Selected");
                            this.ModeSelectContainer.setAttribute("data-SelectMode",PathContainerSelectMode);
                        }
                    }
                }
            }
        });
        /*
        PathSelectDOMTree.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //クリックされたパスコンテナを取得
                const ClickedPathContainer=e.target.closest("div.PathContainer");
                //このパスコンテナのクラスリストをチェックして選択済みかどうか確認
                if(ClickedPathContainer.classList.contains("Selected")){
                    //既に選択されている状態で押されたことになるので、選択を解除する
                    ClickedPathContainer.classList.remove("Selected");
                }else{
                    //まずは全てのPathContainerからSelectedを解除
                    const PathContainerList=this.PathSelectDOMTree.querySelectorAll(":scope>div.PathContainer");
                    PathContainerList.forEach((PathContainer)=>{
                        PathContainer.classList.remove("Selected");
                    });
                    //クリックされたものだけSelected
                    ClickedPathContainer.classList.add("Selected");
                }
            }
        });
        */
    }
    //LoadAndLayoutにDOMTreeを渡す
    static setPathSelectDOMTree(TargetCanvasID=99999,MultipleSelections=this.DefaultMultiSelections){
        /*
        外部から要請を受けてDOMTreeを渡す。
        */
        this.ExistingPathInputSelecter.innerHTML="";//初期化
        const initialoption=document.createElement("option");
        initialoption.text="既にあるDataIDを選択...";
        initialoption.value=(-99999);
        initialoption.disabled=true;//選択不可
        initialoption.hidden=true;//選択肢から除外
        initialoption.selected=true;//初期表示
        //CanvasClassのthis.DataTypeをチェックしていく
        const ExistingPathInputSelecterFragment=document.createDocumentFragment();//仮想DOM
        ExistingPathInputSelecterFragment.appendChild(initialoption);
        const DataIDCanvasIDListMap=new Map();
        const MASKCanvasID2DataIDMap=new Map();
        const MASKDataType=MASKclass.DataType;
        for(const [CanvasID,Canvas] of CanvasClassDictionary.entries()){
            if(Canvas.LayerDataMap.has(this.DataType)){
                const DataID=Canvas.LayerDataMap.get(this.DataType).get("DataID");
                /*
                const option=document.createElement("option");
                option.text=`DataID:${DataID}(CanvasID:${CanvasID}) ${Path}`;
                option.value=DataID;
                fragment.appendChild(option);
                */
                if(DataIDCanvasIDListMap.has(DataID)){
                    DataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    DataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
            }
            /*MASKをもつCanvasIDの走査も一緒に行う*/
            if(Canvas.LayerDataMap.has(MASKDataType)){
                const DataID=Canvas.LayerDataMap.get(MASKDataType).get("DataID");
                MASKCanvasID2DataIDMap.set(CanvasID,DataID);
            }
        }
        for(const [DataID,CanvasIDList] of DataIDCanvasIDListMap){
            const option=document.createElement("option");
            option.text=`DataID: ${DataID} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            ExistingPathInputSelecterFragment.appendChild(option);
        }
        this.ExistingPathInputSelecter.appendChild(ExistingPathInputSelecterFragment);
        /*後回しにしていたComparableSelecterの設定*/
        this.Input1Selecter.innerHTML="";
        this.Input2Selecter.innerHTML="";
        const Input1Selecterinitialoption=document.createElement("option");
        Input1Selecterinitialoption.value=(-99999);//中身はDataID
        Input1Selecterinitialoption.disabled=true;
        Input1Selecterinitialoption.hidden=true;
        Input1Selecterinitialoption.selected=true;
        const Input2Selecterinitialoption=Input1Selecterinitialoption.cloneNode(true);
        Input1Selecterinitialoption.text="GTを選択";
        Input2Selecterinitialoption.text="Predictionを選択";
        Input2Selecterinitialoption.selected=true;
        const Input1Fragment=document.createDocumentFragment();
        const Input2Fragment=document.createDocumentFragment();
        Input1Fragment.appendChild(Input1Selecterinitialoption);
        Input2Fragment.appendChild(Input2Selecterinitialoption);
        for(const [CanvasID,DataID] of MASKCanvasID2DataIDMap.entries()){
            const Input1Selecteroption=document.createElement("option");
            Input1Selecteroption.text=`CanvasID: ${CanvasID}`;
            Input1Selecteroption.value=DataID;//ユーザーに分かりやすいように選択肢はCanvasIDとする
            const Input2Selecteroption=Input1Selecteroption.cloneNode(true);
            Input1Fragment.appendChild(Input1Selecteroption);
            Input2Fragment.appendChild(Input2Selecteroption);
        }
        this.Input1Selecter.appendChild(Input1Fragment);
        this.Input2Selecter.appendChild(Input2Fragment);
        //ModeSelectButtonを初期化する
        this.ModeSelectContainer.setAttribute("data-SelectMode","");
        const ModeSelectButtonArray=this.ModeSelectContainer.querySelectorAll(":scope>button.Selected");
        for(const button of ModeSelectButtonArray){
            button.classList.remove("Selected");
        }
        return this.PathSelectDOMTree;
    }
    /*
    static makeInfoText(LoadPath){
        return LoadPath;
    }
    */

    static async DataLoader(loadPath){
        /*
        MASKDIFF
        loadPath=`{CanvasID}vs{CanvasID}`;
        これをそのまま吐き出す
        */ 
        /*
        const CanvasIDList=loadPath.split("vs").map(CanvasID=>parseInt(CanvasID));
        const MaskADataID=CanvasClassDictionary.get(CanvasIDList[0]).LayerDataMap.get("MASK").get("DataID");
        const MaskBDataID=CanvasClassDictionary.get(CanvasIDList[1]).LayerDataMap.get("MASK").get("DataID");
        const LoadingResult=new Map([
            ["MaskADataID",MaskADataID],
            ["MaskBDataID",MaskBDataID]
        ]);
        */
        const LoadingResult=loadPath;
        return LoadingResult;//一度外部で読み込まれたかのチェックを受けてからコンストラクタに入る
    }

    static async Loading(LoadPathList=[]){
        /*
        makeInfoTextの戻り値と同じ形式のリスト(複数選択対応)を受け取る
        戻り値は
        [DataID,...,DataID]とする。
        複数選択された際、すべてのDataType,DataIDが完璧に読み込めた場合のみ戻り値を返し、
        一つでも不備がある場合はfalseを返すこととする。
        */
        if(LoadPathList.length==0){
            //console.log("選択されませんでした");
            return false;
        }else{
            const DataInfoList=[];
            for(const LoadPath of LoadPathList){
                const LoadedData=await this.DataLoader(LoadPath);
                if(LoadedData){//ちゃんと読み込めているか
                    const DataType=this.DataType;
                    const DicomData=new this(LoadPath,LoadedData);
                    const NewDataID=DicomNextID.get(DataType);
                    DicomNextID.set(DataType,NewDataID+1);
                    const DicomDataMap=new Map([
                        ["Data",DicomData],
                        ["RefCount",0]
                    ]);
                    DicomDataClassDictionary.get(DataType).set(NewDataID,DicomDataMap);
                    DataInfoList.push(NewDataID);
                }else{
                    return false;
                }
            }
            return DataInfoList;
        }
        
    }
    //LoadAndLayoutからデータの読み込みが命令された。データの差し替えや一括読み込みからの経路
    static async LoadingFromDialog(){
        /*
        ダイアログからの入力でがデータを読み込むラッパー
        戻り値はLoadingと同じ
        [[DataType,DataID],[DataType,DataID]...]とする。
        ダメなときはfalseを返す。
        受け取り側は
        CT:リスト or falseとなる感じ
        これをもとにDataInfoMapを作成⇒CanvasInstance.SetLayer()に渡す、という流れ
        */
        /*
        const SelectedPathContainer=this.PathSelectDOMTree.querySelector(":scope>div.PathContainer.Selected");
        if(SelectedPathContainer){
            const PathTypeSelect=SelectedPathContainer.getAttribute("data-Path");//NewPath or ExistingPath
            if(PathTypeSelect==="ExistingPath"){
                const SelectedCanvasID=parseInt(this.ExistingPathInputSelecter.value);
                if(SelectedCanvasID>=0){//誤クリックにより、PathContainerだけクリックされたことを想定
                    const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                    const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                    return [DataID];//Loadingの形式に合わせてある
                }
            }else if(PathTypeSelect=="NewPath"){
                //まずはダイアログからLoadingに渡せる形式の入力を作成する
                const PathText=this.NewPathInputText.value;
                const LoadPathList=PathText.split(", ");
                return this.Loading(LoadPathList);//[DataID,DataID]
            }
        }
        return false;
        */
        const SelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
        if(SelectMode==="Existing"){
            const DataID=parseInt(this.ExistingPathInputSelecter.value);
            if(DataID>=0){
                //const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                //const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                return [DataID];//Loadingの戻り値の形式に一致させる
            }
        }else if(SelectMode==="New"){
            /*
            const PathText=this.NewPathInputText.value;
            const LoadPathList=PathText.split(", ");
            */
            const Input1Value=parseInt(this.Input1Selecter.value);
            const Input2Value=parseInt(this.Input2Selecter.value);
            const LoadPathList=[];
            if(Input1Value>=0&&Input2Value>=0){
                LoadPathList.push(`${Input1Value}${this.DataIDDataIDDelimita}${Input2Value}`);
            }
            const DataIDList=await this.Loading(LoadPathList);//不備があればfalseを返す
            return DataIDList;
        }
        return false;
    }
    static ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap){
        /*
        変更前のPathのArrayが送られてくるので、それらを変更した新しいArrayを返す.
        MASKDIFFはOldPathArrayを解析して、新しいIDを使った新しいパスを作成する
        */
        const TargetDataTypeOld2NewDataIDMap=Old2NewDataIDMap.get(MASKclass.DataType);
        const PathNum=OldPathArray.length;
        const NewPathArray=new Array(PathNum);//長さがわかっているのでこの宣言をした
        for(let i=0;i<PathNum;i++){
            const OldPath=OldPathArray[i];
            const OldDataIDArray=OldPath.split(this.DataIDDataIDDelimita).map(DataIDstr=>parseInt(DataIDstr));
            const NewDataIDArray=OldDataIDArray.map(OldDataID=>TargetDataTypeOld2NewDataIDMap.get(OldDataID));
            const NewPath=NewDataIDArray.join(this.DataIDDataIDDelimita);
            NewPathArray[i]=NewPath;
        }
        return NewPathArray;
    }
    /*適したレイヤーを生成する*/
    static LayerZindex=LayerPriorityMap.get(this.DataType);
    static GetNewLayer(){
        const NewLayer=document.createElement("canvas");
        NewLayer.style.zIndex=this.LayerZindex;
        return NewLayer;
    }
    static SetUniqueFunctions(CanvasID){
        console.log("MASKDIFFClassには固有関数はありません");
    }
    constructor(loadPath,loadedData){
        /*
        このクラスはloadPathが"CanvasIDvsCanvasID"の形式である
        loadedDataも同様である
        */
        this.Path=loadPath;
        /*
        const CanvasIDList=loadedData.split("vs").map(CanvasID=>parseInt(CanvasID));
        const MaskADataID=CanvasClassDictionary.get(CanvasIDList[0]).LayerDataMap.get("MASK").get("DataID");
        const MaskBDataID=CanvasClassDictionary.get(CanvasIDList[1]).LayerDataMap.get("MASK").get("DataID");
        */
        const [GTMaskDataID,PredictionMaskDataID]=loadedData.split(MASKDIFFclass.DataIDDataIDDelimita).map(DataID=>parseInt(DataID));
        const GTMask=DicomDataClassDictionary.get("MASK").get(GTMaskDataID).get("Data");
        const PredictionMask=DicomDataClassDictionary.get("MASK").get(PredictionMaskDataID).get("Data");
        this.width=GTMask.width;
        this.height=GTMask.height;
        this.depth=GTMask.depth;
        const sizePerSlice=this.width*this.height;
        this.ImageVolume=new Float32Array(sizePerSlice*this.depth);
        //2つのボリュームを比較して差分を入れていく
        const histgram=new Map();
        let vMin=Infinity,vMax=-Infinity;
        const PI_div_2=Math.PI/2;
        for(let i=0;i<this.ImageVolume.length;i++){
            //const value=MASKA.ImageVolume[i]-MASKB.ImageVolume[i];
            const GTMaskValue=GTMask.ImageVolume[i];
            const PredictionMaskValue=PredictionMask.ImageVolume[i];
            let DiffValue=Math.abs(GTMaskValue-PredictionMaskValue);//一致していれば0
            if(DiffValue){//0ではないときにTrueとなる=差分があるとき
                if(GTMaskValue*PredictionMaskValue){//ここがTrueとなるのは両方とも０ではないとき、つまり、GTのBGを組織とした、GTの組織をBGとした、という完全な形状の誤検知はやばいミスとする。そうでない場合は許せるミスとする
                    /*
                    GTMaskValueが0ではない、つまり、BGを0という前提の下で見たときに何かしらの組織を別の組織と誤認した。
                    組織があることは認識できたので許せるミスとし、負の値で登録
                    色は緑

                    反対にBGだった場合は、何もないところに組織があると認識したことを意味する
                    やばいミスとして、正の値で登録＝なにもしない
                    色は赤
                    */
                    DiffValue*=-1;//負の値に変換
                }
            }
            this.ImageVolume[i]=Math.atan(DiffValue)/PI_div_2;//画像作成時にやる返還はここでやってしまう。ヒストグラムには元の画素値で登録
            histgram.set(DiffValue,(histgram.get(DiffValue)||0)+1);
            if(DiffValue<vMin)vMin=DiffValue;
            if(DiffValue>vMax)vMax=DiffValue;
        }
        this.histgram=new Map(
            [...histgram.entries()].sort((a,b)=>a[0]-b[0])
        );
        this.i2p=GTMask.i2p;//スライスインデックスから患者座標系ｚ軸を取得(int => float)
        this.p2i=GTMask.p2i;//患者座標系ｚ軸からスライスインデックスを取得(flloat => int)
        this.xMin=GTMask.xMin;
        this.xMax=GTMask.xMax;
        this.yMin=GTMask.yMin;
        this.yMax=GTMask.yMax;
        this.zMin=GTMask.zMin;
        this.zMax=GTMask.zMax;
        this.imagesize=GTMask.imagesize;
        this.vMin=vMin;
        this.vMax=vMax;
        this.ySpacing=GTMask.ySpacing;
        this.xSpacing=GTMask.xSpacing;
        //console.log(vMin,"~",vMax);
        this.currentImageBitmap=null;
    }
    async draw(canvas,DrawStatus){
        const ctx=canvas.getContext("2d");
        ctx.imageSmoothingEnabled=false;
        const dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        ctx.clearRect(0,0,dWidth,dHeight);
        //vMin,vMaxは階調時に変更され、そのあと再描画させることで反映される
        if(DrawStatus.get("regenerate")){
            if(this.currentImageBitmap){
                this.currentImageBitmap.close();
            }
            //新しいImageBitMapを作成して保持
            this.currentImageBitmap= await this.createImageBitmap(DrawStatus.get("index"));
            //console.log("Bitmap",this.currentImageBitmap);
            //DrawStatus.set("regenerate",false);
        }
        //保存されたImageBitMapを描画する
        if(this.currentImageBitmap){
            ctx.drawImage(
                this.currentImageBitmap,
                DrawStatus.get("w0"),DrawStatus.get("h0"),DrawStatus.get("width"),DrawStatus.get("height"),
                0,0,dWidth,dHeight
            );
        }
    }
    createImageBitmap(index){
        //MASK、CONTOUR用のカラーマップを作成する必要がある。
        const rgbArray=new Uint8ClampedArray(this.imagesize*4);
        //const PI_div_2=Math.PI/2;
        for(let i=0;i<this.imagesize;i++){
            const baseindex=i*4;
            let value=this.ImageVolume[index*this.imagesize+i];
            //value=Math.atan(value)/PI_div_2;
            //正と負で場合分けする。正は赤、負は緑
            //console.log(value);
            if(value==0){
                rgbArray[baseindex]=255;//R
                rgbArray[baseindex+1]=255;//G
                rgbArray[baseindex+2]=255;//B
                rgbArray[baseindex+3]=0.2*255;//A
            }else if(value>0){
                rgbArray[baseindex]=255*value;//R
                rgbArray[baseindex+1]=0;//G
                rgbArray[baseindex+2]=0;//B
                rgbArray[baseindex+3]=0.3*255;//A
            }else if(value<0){//負がある時点でvMin<0
                rgbArray[baseindex]=0;//R
                rgbArray[baseindex+1]=255*(-value);//G
                rgbArray[baseindex+2]=0;//B
                rgbArray[baseindex+3]=0.3*255;//A
            }
        }
        const imageData=new ImageData(rgbArray,this.width,this.height);
        //console.log("imageData",imageData);
        return createImageBitmap(imageData);
    }
}
class CONTOURclass{
    static DataType="CONTOUR";
    static PathTarget="openFile";
    static DefaultMultiSelections="";
    static FilePathCanvasIDDelimita=`<|${this.DataType}|>`;//このデータクラスでは (読み込むファイルパス)|(元となるCT画像のCanvasID) という形でパスを持つ
    static {
        this.InitializePathSelectDOMTree();
    }
    //DOMTreeのパーツと必要なイベントの設定
    static InitializePathSelectDOMTree(){
        const PathSelectDOMTree=document.createElement("div");
        PathSelectDOMTree.id=this.DataType;//CSSで個別設定をするために必要になる
        PathSelectDOMTree.className="PathSelectDOMTree";
        /*DataTypeのタイトル欄*/
        const TitleDiv=document.createElement("div");
        TitleDiv.className="DataTypeDisplay";
        TitleDiv.textContent=`${this.DataType} の読み込み`;
        PathSelectDOMTree.appendChild(TitleDiv);
        /*パスの指定コンテナ*/
        const PathSettingContainer=document.createElement("div");
        PathSettingContainer.className="FilePathInputWithCanvasIDSelectSettingContainer";
        //1. modeセレクトボタン
        const ModeSelectContainer=document.createElement("div");
        ModeSelectContainer.className="ModeSelectContainer";
        const NewModeButton=document.createElement("button");
        NewModeButton.setAttribute("data-SelectMode","New");
        NewModeButton.textContent="新規";
        const ExistingModeButton=document.createElement("button");
        ExistingModeButton.setAttribute("data-SelectMode","Existing");
        ExistingModeButton.textContent="既存";
        ModeSelectContainer.appendChild(NewModeButton);
        ModeSelectContainer.appendChild(ExistingModeButton);
        PathSettingContainer.appendChild(ModeSelectContainer);
        //2. PathInputContainer
        const PathInputContainer=document.createElement("div");
        PathInputContainer.className="PathInputContainer";
        const NewPathContainer=document.createElement("div");
        NewPathContainer.classList.add("PathContainer");//パーツ名
        //NewPathContainer.classList.add("FilePathInput");//入力方法
        NewPathContainer.setAttribute("data-SelectMode","New");
        //ファイルパス参照＆入力部分
        const LoadPathParts=document.createElement("div");
        LoadPathParts.className="LoadPathParts";
        const NewPathInputText=document.createElement("input");
        NewPathInputText.className="NewPathInputText";
        NewPathInputText.type="text";
        NewPathInputText.placeholder="新しく読み込むデータのパスを入力...";
        const OpenFileDialogButton=document.createElement("button");
        OpenFileDialogButton.className="OpenFildDialogButton";
        OpenFileDialogButton.textContent="参照";
        OpenFileDialogButton.setAttribute("data-MultipleSelections",this.DefaultMultiSelections);//このDomに複数選択状態を設定しておくことでその都度切り替えられるようにする
        LoadPathParts.appendChild(NewPathInputText);
        LoadPathParts.appendChild(OpenFileDialogButton);
        //元となったCT画像をCanvasIDから選択するセレクタ部分
        const ReferOriginalParts=document.createElement("div");
        ReferOriginalParts.className="ReferOriginalParts";
        const ReferOriginalPathInputSelecter=document.createElement("select");
        ReferOriginalParts.appendChild(ReferOriginalPathInputSelecter);
        NewPathContainer.appendChild(LoadPathParts);
        NewPathContainer.appendChild(ReferOriginalParts);
        PathInputContainer.appendChild(NewPathContainer);

        //既存のデータの参照を指定する部分。セレクターはこの時点では空としておき、起動時にoptionを設定する。
        //選択肢はCanvasIDとする(CanvasID＝？に映ってるCT画像をこっちのCanvasIDでも表示させたい、のようなイメージ)
        const ExistingPathContainer=document.createElement("div");
        ExistingPathContainer.classList.add("PathContainer");//パーツ名
        //ExistingPathContainer.classList.add("ExistingCanvasIDSelect");//入力方法
        ExistingPathContainer.setAttribute("data-SelectMode","Existing");
        const ExistingPathInputSelecter=document.createElement("select");
        ExistingPathInputSelecter.className="ExistingPathInputSelecter";
        ExistingPathContainer.appendChild(ExistingPathInputSelecter);
        PathInputContainer.appendChild(ExistingPathContainer);
        PathSettingContainer.appendChild(PathInputContainer);
        PathSelectDOMTree.appendChild(PathSettingContainer);
        //これはLoadAndLayoutなどから要請されて外部に渡したりする。
        //そのとき、ExistingPathInputSelecterのOptionを再構成して渡す
        this.OpenFileDialogButton=OpenFileDialogButton;//複数選択か単数選択かをセットしたり、確認する必要があるから
        this.ModeSelectContainer=ModeSelectContainer;//Selectedクラスの有無を確かめる必要があるから
        this.NewPathInputText=NewPathInputText;
        this.ReferOriginalPathInputSelecter=ReferOriginalPathInputSelecter;
        this.ExistingPathInputSelecter=ExistingPathInputSelecter;
        this.PathSelectDOMTree=PathSelectDOMTree;
        const TabIndexTargetArray=[NewModeButton,ExistingModeButton,NewPathInputText,OpenFileDialogButton,ReferOriginalPathInputSelecter,ExistingPathInputSelecter];
        TabIndexTargetArray.forEach((element)=>element.tabIndex="-1");
        //console.dir(this.PathSelectDOMTree);
        /*OpenFileDialogButtonにイベントを設定する*/
        this.OpenFileDialogButton.addEventListener("mouseup",async (e)=>{
            if(e.button===0){//左クリックなら
                //属性値を取得
                const MultipleSelections=e.target.getAttribute("data-MultipleSelections");//"multipleSelections" or "" になるはず
                const PathTarget=this.PathTarget;
                const DialogTitle=`${this.DataType} 選択ダイアログ`;
                const SelectedPathList=await LoadAndLayout.SelectPathes(DialogTitle,PathTarget,MultipleSelections);//[]リストみたいな形式
                //SelectedPathListはリストで帰ってくることもあれば単一文字列で帰ってくることもあるが、showOpenDialogはかならず[filepath,...]の形式でパス文字列を返すのでfor文を回して良し
                /*
                ここではパスの選択は行うが読み込みはまだ行わない。現在読み込んだパスの配列を", "で結合してtextに表示する
                */
                this.NewPathInputText.value=SelectedPathList.join(", ");
            }
        });
        /*
        ModeSelectContainer内のボタンにイベントを付与
        */
        this.ModeSelectContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                const button=e.target;
                if(button.tagName==="BUTTON"){
                    //押されたbuttonにSelectedクラスが付与されているか
                    if(button.classList.contains("Selected")){
                        //押されているのでbuttonからSelectedを解除して、ModeSelectContainerのmode属性値を空白にする
                        button.classList.remove("Selected");
                        this.ModeSelectContainer.setAttribute("data-SelectMode","");
                    }else{
                        //まずは直下のbutton全てからSelectedを取り除く
                        const ButtonList=this.ModeSelectContainer.querySelectorAll(":scope>button");
                        ButtonList.forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        button.classList.add("Selected");
                        const modeAttribute=button.getAttribute("data-SelectMode");
                        this.ModeSelectContainer.setAttribute("data-SelectMode",modeAttribute);
                    }
                }
            }
        });
        /*
        PathInputContainerにクリックイベントを付与
        マウスダウン時にPathContainerまで辿っていく
        */
        PathInputContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //e.targetから親を辿る
                const PathContainer=e.target.closest("div.PathContainer");
                if(PathContainer){
                    const PathContainerSelectMode=PathContainer.getAttribute("data-SelectMode");
                    const ModeSelectContainerSelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
                    if(PathContainerSelectMode!==ModeSelectContainerSelectMode){
                        //変更する必要あり
                        this.ModeSelectContainer.querySelectorAll(":scope>button").forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        //PathContainerSelectModeと同じ属性値を持つButtonを取得
                        const SelectedButton=this.ModeSelectContainer.querySelector(`:scope>button[data-SelectMode="${PathContainerSelectMode}"]`);
                        if(SelectedButton){
                            SelectedButton.classList.add("Selected");
                            this.ModeSelectContainer.setAttribute("data-SelectMode",PathContainerSelectMode);
                        }
                    }
                }
            }
        });
        /*
        PathSelectDOMTree.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //クリックされたパスコンテナを取得
                const ClickedPathContainer=e.target.closest("div.PathContainer");
                //このパスコンテナのクラスリストをチェックして選択済みかどうか確認
                if(ClickedPathContainer.classList.contains("Selected")){
                    //既に選択されている状態で押されたことになるので、選択を解除する
                    ClickedPathContainer.classList.remove("Selected");
                }else{
                    //まずは全てのPathContainerからSelectedを解除
                    const PathContainerList=this.PathSelectDOMTree.querySelectorAll(":scope>div.PathContainer");
                    PathContainerList.forEach((PathContainer)=>{
                        PathContainer.classList.remove("Selected");
                    });
                    //クリックされたものだけSelected
                    ClickedPathContainer.classList.add("Selected");
                }
            }
        });
        */
    }
    //LoadAndLayoutにDOMTreeを渡す
    static setPathSelectDOMTree(TargetCanvasID=99999,MultipleSelections=this.DefaultMultiSelections){
        /*
        外部から要請を受けてDOMTreeを渡す。
        */
        //状況によって複数パス選択可能か否か変動するため、これが呼ばれるたびにOpenFileDialogのAttributeを更新する
        this.OpenFileDialogButton.setAttribute("data-MultipleSelections",MultipleSelections);
        //ReferOriginalPathInputSelecterを更新し、CT画像を持つCanvasIDとパスを表示する
        this.ReferOriginalPathInputSelecter.innerHTML="";
        const ReferOriginalPathInputSelecterInitialOption=document.createElement("option");
        ReferOriginalPathInputSelecterInitialOption.text="元のCTを選択";
        ReferOriginalPathInputSelecterInitialOption.value=(-99999);
        ReferOriginalPathInputSelecterInitialOption.disabled=true;
        ReferOriginalPathInputSelecterInitialOption.hidden=true;
        ReferOriginalPathInputSelecterInitialOption.selected=true;
        const ReferOriginalPathInputSelecterFragment=document.createDocumentFragment();
        ReferOriginalPathInputSelecterFragment.appendChild(ReferOriginalPathInputSelecterInitialOption);
        const ReferOriginalPathInputSelecterDataIDCanvasIDListMap=new Map();//{CanvasID:DataID}
        //Path入力欄の初期化
        this.NewPathInputText.value="";
        //ExistingPathInputSelecterのOptionを更新する
        this.ExistingPathInputSelecter.innerHTML="";//初期化
        const ExistingPathInputSelecterInitialOption=document.createElement("option");
        ExistingPathInputSelecterInitialOption.text="既にあるDataIDを選択...";
        ExistingPathInputSelecterInitialOption.value=(-99999);
        ExistingPathInputSelecterInitialOption.disabled=true;//選択不可
        ExistingPathInputSelecterInitialOption.hidden=true;//選択肢から除外
        ExistingPathInputSelecterInitialOption.selected=true;//初期表示
        //CanvasClassのthis.DataTypeをチェックしていく
        const ExistingPathInputSelecterFragment=document.createDocumentFragment();//仮想DOM
        ExistingPathInputSelecterFragment.appendChild(ExistingPathInputSelecterInitialOption);
        const ExistingPathInputSelecterDataIDCanvasIDListMap=new Map();
        const CONTOURDataType=this.DataType;
        const CTDataType=CTclass.DataType;
        let DefaultOriginalCTDataID=-99999;
        for(const [CanvasID,Canvas] of CanvasClassDictionary.entries()){
            if(Canvas.LayerDataMap.has(CONTOURDataType)){
                const DataID=Canvas.LayerDataMap.get(CONTOURDataType).get("DataID");
                /*
                const option=document.createElement("option");
                option.text=`DataID:${DataID}(CanvasID:${CanvasID}) ${Path}`;
                option.value=DataID;
                fragment.appendChild(option);
                */
                if(ExistingPathInputSelecterDataIDCanvasIDListMap.has(DataID)){
                    ExistingPathInputSelecterDataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    ExistingPathInputSelecterDataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
            }
            if(Canvas.LayerDataMap.has(CTDataType)){
                const DataID=Canvas.LayerDataMap.get(CTDataType).get("DataID");
                if(ReferOriginalPathInputSelecterDataIDCanvasIDListMap.has(DataID)){
                    ReferOriginalPathInputSelecterDataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    ReferOriginalPathInputSelecterDataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
                //DataIDがデフォルト選択にするものかチェック
                if(CanvasID===TargetCanvasID){
                    DefaultOriginalCTDataID=DataID;
                }
            }
        }
        //既存セレクタの再構成
        for(const [DataID,CanvasIDList] of ExistingPathInputSelecterDataIDCanvasIDListMap.entries()){
            const option=document.createElement("option");
            option.text=`DataID: ${DataID} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            ExistingPathInputSelecterFragment.appendChild(option);
        }
        this.ExistingPathInputSelecter.appendChild(ExistingPathInputSelecterFragment);
        //オリジナルとなるCTセレクタの再構成
        for(const [DataID,CanvasIDList] of ReferOriginalPathInputSelecterDataIDCanvasIDListMap.entries()){
            const option=document.createElement("option");
            const Path=DicomDataClassDictionary.get(CTclass.DataType).get(DataID).get("Data").Path;
            option.text=`DataID:${DataID} ${Path} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            ReferOriginalPathInputSelecterFragment.appendChild(option);
        }
        /*
        for(const [CanvasID,DataID] of ReferOriginalPathInputSelecterCanvasIDDataIDMap.entries()){
            const option=document.createElement("option");
            const Path=DicomDataClassDictionary.get(CTclass.DataType).get(DataID).get("Data").Path;
            option.text=`CanvasID:${CanvasID} ${Path}`;
            option.value=DataID;
            ReferOriginalPathInputSelecterFragment.appendChild(option);
        }
        */
        this.ReferOriginalPathInputSelecter.appendChild(ReferOriginalPathInputSelecterFragment);
        if(DefaultOriginalCTDataID>=0){
            this.ReferOriginalPathInputSelecter.value=DefaultOriginalCTDataID;
        }
        //ModeSelectButtonを初期化する
        this.ModeSelectContainer.setAttribute("data-SelectMode","");
        const ModeSelectButtonArray=this.ModeSelectContainer.querySelectorAll(":scope>button.Selected");
        for(const button of ModeSelectButtonArray){
            button.classList.remove("Selected");
        }
        return this.PathSelectDOMTree;
    }
    /*
    static makeInfoText(LoadPath){
        return LoadPath;
    }
    */

    static async DataLoader(loadPath){
        //CTclass用のパス読み込み静的関数
        //戻り値の形式はこのコンストラクターが受け付けるものとする
        const LoadingResult=await LoadAndLayout.LoadFiles(loadPath);
        return LoadingResult;//一度外部で読み込まれたかのチェックを受けてからコンストラクタに入る
    }

    static async Loading(LoadPathList=[]){
        /*
        makeInfoTextの戻り値と同じ形式のリスト(複数選択対応)を受け取る
        戻り値は
        [DataID,...,DataID]とする。
        複数選択された際、すべてのDataType,DataIDが完璧に読み込めた場合のみ戻り値を返し、
        一つでも不備がある場合はfalseを返すこととする。
        */
        if(LoadPathList.length==0){
            //console.log("選択されませんでした");
            return false;
        }else{
            const DataInfoList=[];
            for(const LoadPath of LoadPathList){
                //console.log(LoadPath);
                const [FilePath,DataIDstr]=LoadPath.split(this.FilePathCanvasIDDelimita);
                const NewLoadedData=await this.DataLoader(FilePath);
                /*
                const CanvasID=parseInt(CanvasIDstr);
                const OriginalCTCanvas=CanvasClassDictionary.get(CanvasID);
                const OriginalCTDataID=OriginalCTCanvas.LayerDataMap.get(CTclass.DataType).get("DataID");
                */
                const OriginalCTDataID=parseInt(DataIDstr);
                //console.log(OriginalCTDataID);
                const _DicomDataClass=DicomDataClassDictionary.get(CTclass.DataType);
                const _OriginalCTData=_DicomDataClass.get(OriginalCTDataID);
                const _CTData=_OriginalCTData.get("Data");
                const OriginalCTData=DicomDataClassDictionary.get(CTclass.DataType).get(OriginalCTDataID).get("Data");
                if(NewLoadedData&&OriginalCTData){//ちゃんと読み込めているか
                    //OriginalCTの参照はコンストラクタ内でもできるが、コンストラクタが走るとエラーに関わらずインスタンスが生成されるような気がするので、確実に完了させるために事前にチェックする方策をとる
                    const LoadedData=new Map([
                        ["NewLoadedData",NewLoadedData],
                        ["OriginalCTData",OriginalCTData]//サイズ関連のデータをconstructerで参照する
                    ]);
                    const DataType=this.DataType;
                    const DicomData=new this(LoadPath,LoadedData);
                    const NewDataID=DicomNextID.get(DataType);
                    DicomNextID.set(DataType,NewDataID+1);
                    const DicomDataMap=new Map([
                        ["Data",DicomData],
                        ["RefCount",0]
                    ]);
                    DicomDataClassDictionary.get(DataType).set(NewDataID,DicomDataMap);
                    DataInfoList.push(NewDataID);
                }else{
                    return false;
                }
            }
            return DataInfoList;
        }
    }
    //LoadAndLayoutからデータの読み込みが命令された。データの差し替えや一括読み込みからの経路
    static async LoadingFromDialog(){
        const SelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
        if(SelectMode==="Existing"){
            const DataID=parseInt(this.ExistingPathInputSelecter.value);
            if(DataID>=0){
                //const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                //const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                return [DataID];//Loadingの戻り値の形式に一致させる
            }
        }else if(SelectMode==="New"){
            //CONTOURはセレクタにてCanvasIDの指定もされているのでそれと合わせたパス文字列を生成する
            const PathText=this.NewPathInputText.value;
            const OriginalCTDataID=this.ReferOriginalPathInputSelecter.value;
            const LoadPathList=PathText.split(", ").map(path=>`${path}${this.FilePathCanvasIDDelimita}${OriginalCTDataID}`);//複数読み込みを禁止しているので必ず長さ1の配列になるはず
            //一応個数チェック
            if(LoadPathList.length!=1){
                console.log(this.DataType,"読み込み時エラー パスが複数あり",LoadPathList);
                return false;
            }
            //FilePath|CanvasIDという形式の文字列を渡す
            const DataIDList=await this.Loading(LoadPathList);
            return DataIDList;
        }
        return false;
    }
    static ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap){
        /*
        変更前のPathのArrayが送られてくるので、それらを変更した新しいArrayを返す.
        CONTOURはPath変換＆DataID変換が必要
        CONTOURPathの形式はPath:DataID
        */
        const NewPathArray=[];
        for(let i=0;i<OldPathArray.length;i++){
            let Before2MiddlePath=OldPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const BeforePattern=BeforeAndAfterPatternMap.get("Before");
                Before2MiddlePath=Before2MiddlePath.replace(BeforePattern,MiddlePattern);
            }
            NewPathArray.push(Before2MiddlePath);
        }
        const TargetDataTypeOld2NewDataIDMap=Old2NewDataIDMap.get(CTclass.DataType);
        for(let i=0;i<NewPathArray.length;i++){
            let Middle2AfterPath=NewPathArray[i];
            let [Middle2AfterFilePath,Middle2AfterDataIDstr]=Middle2AfterPath.split(this.FilePathCanvasIDDelimita);
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const AfterPattern=BeforeAndAfterPatternMap.get("After");
                Middle2AfterFilePath=Middle2AfterFilePath.replace(MiddlePattern,AfterPattern);
            }
            const NewDataID=TargetDataTypeOld2NewDataIDMap.get(parseInt(Middle2AfterDataIDstr));
            NewPathArray[i]=[Middle2AfterFilePath,NewDataID].join(this.FilePathCanvasIDDelimita);
        }
        return NewPathArray;
        /*
        const TargetDataTypeOld2NewDataIDMap=Old2NewDataIDMap.get(CTclass.DataType);
        const PathNum=OldPathArray.length;
        const NewPathArray=new Array(PathNum);//長さがわかっているのでこの宣言をした
        for(let i=0;i<PathNum;i++){
            const OldPath=OldPathArray[i];
            const [OldFilePath,OldDataIDstr]=OldPath.split(this.FilePathCanvasIDDelimita);
            const NewFilePath=OldFilePath.replace(BeforeTarget,AfterTarget);
            const NewDataID=TargetDataTypeOld2NewDataIDMap.get(parseInt(OldDataIDstr));
            const NewPath=[NewFilePath,NewDataID].join(this.FilePathCanvasIDDelimita);
            NewPathArray[i]=NewPath;
        }
        return NewPathArray;
        */
    }
    /*適したレイヤーを生成する*/
    static LayerZindex=LayerPriorityMap.get(this.DataType);
    static GetNewLayer(){
        /*CONTOURはcanvasではなくSVGを使う*/
        const NewLayer=document.createElement("canvas");
        //const NewLayer=document.createElementNS(SVGNameSpace,"svg");
        NewLayer.style.zIndex=this.LayerZindex;
        return NewLayer;
    }
    static SetUniqueFunctions(CanvasID){
        /*ここで変更を加えるオブジェクトにアクセス*/
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const FlagMap=CanvasInstance.FlagMap;
        const ContextMenuButtonContainer=CanvasInstance.ContextMenuButtonContainer;
        const FromMainProcessToMainFunctions=CanvasInstance.FromMainProcessToMainFunctions;
        const CanvasBlock=CanvasInstance.CanvasBlock;

        const ROISelectButton=document.createElement("button");
        ROISelectButton.className="CONTOUR";//DataTypeをクラス名に持つ要素で絞り込みをして、それを表示するためのクラス名
        ROISelectButton.textContent="ROI選択";
        ROISelectButton.value=CanvasID;
        ContextMenuButtonContainer.appendChild(ROISelectButton);
        //ボタンを押すとサブウィンドウが開く
        Canvas.EventSetHelper(CanvasID,ROISelectButton,"mouseup",(e)=>{
            if(e.button===0){
                const CanvasID=parseInt(e.target.value);
                this.OpenROISelectSubWindow(CanvasID);
            }
        });
        //FlagMapにCONTOURROIClickモード用のフラグを追加
        FlagMap.set("CONTOURROIClick",new Map([["Flag",false],["Func",this.CONTOURROIClickFlagFunction]]));
        //マスククリックモードを有効化する/無効化するための関数を登録
        FromMainProcessToMainFunctions.set("CONTOURROIClickModeSwitching",(data)=>{
            this.CONTOURROIClickModeSwitchingFunction(data);
        });
        Canvas.EventSetHelper(CanvasID,CanvasBlock,"mousedown",(e)=>{
            if(e.button===0){
                const CanvasBlock=e.target.closest("div.CanvasBlock");
                const CanvasID=parseInt(CanvasBlock.getAttribute("data-CanvasID"));
                this.CONTOURROIClickedFunction(CanvasID);
            }
        });
        FromMainProcessToMainFunctions.set("ChangeROIStatusSet",(data)=>{
            this.ChangeROIStatusSetFunction(data);
        });
        FromMainProcessToMainFunctions.set("ChangeROISelect",(data)=>{
            //console.log("一個だけ変更");
            this.ChangeROISelectFunction(data);
        });
    }
    static OpenROISelectSubWindow(CanvasID){
        /*輪郭の選択画面*/
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const Layer=this.DataType;
        const DataID=CanvasInstance.LayerDataMap.get(Layer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(Layer).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        const windowsize=[300,400];//ROINameの最長＆ROIの個数を基に動的に変える必要がある
        const AllowAddOrDeleteFlag=false;
        const data=new Map([
            ["ROINameColorMap",DicomDataInstance.ContourColorMap],//{ROIName:Hex} ROI名と色の表示に必要
            ["ROISelectStatusSet",DicomDataInstance.ROISelectStatusSet],//現時点で何が選ばれているかを示す
            ["ROIMemoryStatusSet",DicomDataInstance.ROIMemoryStatusSet],//現時点で何が記憶されていたかを示す
            /*["ROISelectWindowStyleMap",DicomDataInstance.ROISelectWindowStyleMap],*/ //ボタンサイズなどの諸設定
            ["windowsize",windowsize],
            ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
            ["Layer",Layer],
            ["CanvasID",CanvasID]
        ]);
        const Initialalldata=new Map([
            ["action","ROISelect"],
            ["data",data],
        ]);
        Canvas.openSubWindow(Initialalldata);
    }
    static CONTOURROIClickFlagFunction(CanvasInstance){
        /*
        if(this.MultiUseLayerModeFlagSet.has("MASKClick")&&this.mouseenter&&!ZoomPanKeyPressed){
            this.MASKClickFlag=true;
        }else{
            this.MASKClickFlag=false;
        }
        */
        const MultiUseLayerModeFlag=CanvasInstance.MultiUseLayerModeFlagSet.has("CONTOURROIClick");
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        return MultiUseLayerModeFlag&&CanvasInstance.mouseenter&&!ZoomPanKeyPressedFlag;
    }
    static CONTOURROIClickModeSwitchingFunction(data){
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const Activate=ReceivedDataBody.get("Activate");
        const ModeFlagName="CONTOURROIClick";
        if(Activate){
            CanvasInstance.MultiUseLayerModeFlagSet.add(ModeFlagName);
        }else{
            CanvasInstance.MultiUseLayerModeFlagSet.delete(ModeFlagName);
        }
        CanvasInstance.FlagUpdater();
    }
    static CONTOURROIClickedFunction(CanvasID){
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const CONTOURROIClickFlag=CanvasInstance.FlagMap.get("CONTOURROIClick").get("Flag");
        if(CONTOURROIClickFlag&&CanvasInstance.LayerDataMap.has("CONTOUR")){
            const MouuseTrack=CanvasInstance.MouseTrack;
            const NewX=MouuseTrack.get("current").get("x");
            const NewY=MouuseTrack.get("current").get("y");
            const Rect=CanvasInstance.CanvasBlock.getBoundingClientRect();
            const DrawStatus=CanvasInstance.DrawStatus;
            const Currentw0=DrawStatus.get("w0");
            const Currenth0=DrawStatus.get("h0");
            const Currentwidth=DrawStatus.get("width");
            const Currentheight=DrawStatus.get("height");
            const CurrentIndex=DrawStatus.get("index");
            //現在描画領域を考慮した座標を計算
            const ClickedPointX=Currentwidth*(NewX/Rect.width)+Currentw0;
            const ClickedPointY=Currentheight*(NewY/Rect.height)+Currenth0;
            //Maskclassに判定依頼、その場所のMaskValueが返ってくる
            const LayerData=CanvasInstance.LayerDataMap.get("CONTOUR");
            const ctx=LayerData.get("Layer").getContext("2d");
            const DataID=LayerData.get("DataID");
            const DicomDataInstance=DicomDataClassDictionary.get("CONTOUR").get(DataID).get("Data");
            const ClickedROISet=DicomDataInstance.getClickedROISet(ctx,CurrentIndex,ClickedPointX,ClickedPointY);
            const data=new Map([
                ["action","CONTOURROIClicked"],
                ["data",new Map([
                    ["CanvasID",CanvasID],
                    ["ClickedROISet",ClickedROISet]
                ])]
            ]);
            Canvas.PassChangesToSubWindow(data);
        }
    }
    static ChangeROIStatusSetFunction(data){
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const TargetLayer=ReceivedDataBody.get("Layer");
        const DataType=TargetLayer;
        const DataID=CanvasInstance.LayerDataMap.get(TargetLayer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        const Mode=ReceivedDataBody.get("Mode");//"Select" or "Memory"
        DicomDataInstance.ChangeROIStatusSet(data);
        if(Mode==="Select"){
            //SelectStatusの変更だったら再描画必要
            CanvasInstance.DrawStatus.set("regenerate",true);
            CanvasInstance.Layerdraw(TargetLayer);
        }
    }
    static ChangeROISelectFunction(data){
        const ReceivedDataBody=data.get("data");
        const CanvasID=ReceivedDataBody.get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const TargetLayer=ReceivedDataBody.get("Layer");
        const DataType=TargetLayer;
        const DataID=CanvasInstance.LayerDataMap.get(TargetLayer).get("DataID");
        const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
        const DicomDataInstance=DicomDataInfoMap.get("Data");
        //指定されたROINameを選択状態集合に追加/削除する。その後、その組織の出現するスライスの最大値と最小値を返す
        const [MinIndex,MaxIndex]=DicomDataInstance.ChangeROISelect(data);
        const CurrentIndex=CanvasInstance.DrawStatus.get("index");//現在のスライスインデックスになっているはず
        const Selected=ReceivedDataBody.get("Selected");//trueなら追加、falseなら削除
        const CenterIndex=[MinIndex,CurrentIndex,MaxIndex].sort((a,b)=>a-b)[1];
        const JunpIndex=MinIndex;//範囲外のとき、その組織の先頭スライスに移動する。最大知か最小値のどちらかに近いほうにジャンプする方法では、どちら側に輪郭が続くかわかりづらいので、常に最小値にジャンプする方法をとる。
        /*
        再描画の方法は二つ
        1．CONTOURレイヤーのみの再描画⇒削除時、現在のスライスが範囲内にあるとき or 追加時、現在のスライスが範囲内にあるとき
        2．全レイヤーの再描画⇒追加時、現在のスライスが範囲外のとき、最大値と最小値の近いほうにジャンプする
        つまり、現在のスライスが範囲内にあるときかならず層のみの再描画を行う
        範囲外のとき、Select時のみジャンプを走らせる
        */
        if(CurrentIndex===CenterIndex){
            //範囲内
            CanvasInstance.DrawStatus.set("regenerate",true);
            CanvasInstance.Layerdraw(TargetLayer);
        }else{
            if(Selected){
                //範囲外に追加された場合のみジャンプを走らせる
                //console.log("ジャンプ走らせる",[MinIndex,CurrentIndex,MaxIndex],"=>",JunpIndex);
                const Slider=CanvasInstance.slider;
                Slider.value=JunpIndex;
                Slider.dispatchEvent(new Event("input"));    
            }
        }
                
    }
    //Contour専用のカラーマップ生成関数
    static hsv2rgb(h,s=1,v=1){
        // 引数処理
        h = (h < 0 ? h % 360 + 360 : h) % 360 / 60;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        
        // HSV to RGB 変換
        const c = [5, 3, 1].map(n =>
            Math.round((v - Math.max(0, Math.min(1, 2 - Math.abs(2 - (h + n) % 6))) * s * v) * 255));

        // 戻り値
        /*
        return {
            hex: `#${(c[0] << 16 | c[1] << 8 | c[2]).toString(16).padStart(6, '0')}`,
            rgb: c, r: c[0], g: c[1], b: c[2],
        };
        */
        const HexValueList=[c[0],c[1],c[2]];
        const HexText=`#${HexValueList.map(v=>v.toString(16).padStart(2,"0")).join("")}`;
        return HexText;
    }
    constructor(loadPath,loadedData){
        this.Path=loadPath;
        const DicomData=loadedData.get("NewLoadedData")[0]["dataset"];//かならずシングルロードだから
        const OriginalCTData=loadedData.get("OriginalCTData");
        //OriginalCTDataからサイズに関する情報をもらう
        /*画像座標系の情報*/
        this.width=OriginalCTData.width;//画像座標系の幅
        this.height=OriginalCTData.height;//画像座標系の高さ
        this.depth=OriginalCTData.depth;//スライス枚数
        /*患者座標系の情報*/
        this.xMin=OriginalCTData.xMin;
        this.xMax=OriginalCTData.xMax;
        this.yMin=OriginalCTData.yMin;
        this.yMax=OriginalCTData.yMax;
        this.zMin=OriginalCTData.zMin;
        this.zMax=OriginalCTData.zMax;
        this.imagesize=OriginalCTData.imagesize;
        /*画像座標スライスインデックスと患者座標ｚ軸の相互変換*/
        this.i2p=OriginalCTData.i2p;
        this.p2i=OriginalCTData.p2i;
        //console.log(this.p2i);
        //以上の情報を基に、輪郭データを読み込みながら逐次画像座標に変換してPath2Dにする
        /*
        DicomData内の輪郭データの解析を始める
        このとき、患者座標系から画像座標系への変換も行う。そのためにOriginalCTDataのIPP、IOP、pixelScaleなどが必要
        */
        /*
        1. データは{ROIName:{z1:Path2D,z2:Path2D,...,}}という形式で保存する。このようにすればROIごとの出現スライスも容易にアクセス可能
        2．現在の選択状態はROINameのSetとする。
        */
        //ROIStructerSetROISequenceからROINameとROINumberに対応を保持する
        const ROINumberROINameMap=new Map();
        /*
        console.log(DicomData);
        const a=DicomData.elements;
        const b=a.x30060020;
        const c=b.items;
        const StructureSetROISequenceItemArray=c;
        */
        const StructureSetROISequenceItemArray=DicomData.elements.x30060020.items;
        for(const StructureSetROISequenceItem of StructureSetROISequenceItemArray){
            const ROINumber=StructureSetROISequenceItem.dataSet.intString("x30060022");//ROINumber
            const ROIName=StructureSetROISequenceItem.dataSet.string("x30060026");//ROIName
            ROINumberROINameMap.set(ROINumber,ROIName);//ROINumber⇒ROIName
        }
        //ROIContourSequenceの解析
        this.ContourDataMap=new Map();
        const ROIContourSequenceItemArray=DicomData.elements.x30060039.items;
        for(const ROIContourSequneceItem of ROIContourSequenceItemArray){
            //この組織の輪郭のROINumberを取得
            const ROINumber=ROIContourSequneceItem.dataSet.intString("x30060084")//参照ROI番号
            const ROIName=ROINumberROINameMap.get(ROINumber);
            //ContourSequenceの中身を解析する
            const ContourSequenceElement=ROIContourSequneceItem.dataSet.elements.x30060040;
            //輪郭データが登録されているかのチェック
            if(!(ContourSequenceElement&&ContourSequenceElement.items)){
                //何かしらの理由でこのROIの輪郭データがない
                console.log(ROINumber,ROIName,"ContourSequenceなし");
                continue;
            }
            const ContourSequenceItemArray=ContourSequenceElement.items;//あるROIに対してスライス分(輪郭分、同じスライスに複数の輪郭があったりもする)のデータがある
            //この組織の輪郭マップ
            //くりぬきなども含めて一つのPath2Dにしないとevenoddでくりぬき出来ない
            const ROIContourDataMap=new Map();//{z:[Path2D]という感じにする}
            for(const ContourSequenceItem of ContourSequenceItemArray){
                const ContourGeometricType=ContourSequenceItem.dataSet.string("x30060042");//輪郭データの形状
                if(ContourGeometricType!=="CLOSED_PLANAR"){//閉じている輪郭だけを対象としている
                    continue;
                }
                //輪郭データを抜き出す
                const ContourDataString=ContourSequenceItem.dataSet.string("x30060050");
                if(!ContourDataString){
                    console.error("ContourData (x30060050) が取得できませんでした");
                    continue;
                }
                const ContourData=ContourDataString.split("\\").map(parseFloat);
                /*ここで、OriginalCTDataの情報を基に画像座標系に変換しながら読み込んでいく*/
                //スライスごとの輪郭で、Z座標は全て一致するという前提のもとZ座標を取得
                const PatientZ=ContourData[2];
                //console.log(ContourData,typeof(ContourData));
                const Z=this.p2i.has(PatientZ)?this.p2i.get(PatientZ):null;
                if(Z===null){
                    console.error(`${ROIName}のPatientZ : ${PatientZ} となる画像座標系が見つからなかった`);
                    console.log(ContourData);
                    continue;
                }
                //[[x,y],...,のArrayを作る
                //const XYArray=[];
                //X,Yの解析とPath2D化を同時進行する
                const StartPatientX=ContourData[0];
                const StartPatientY=ContourData[1];
                const StartX=(this.width-1)*(StartPatientX-this.xMin)/(this.xMax-this.xMin);
                const StartY=(this.height-1)*(StartPatientY-this.yMin)/(this.yMax-this.yMin);
                const ContourPath=new Path2D();
                ContourPath.moveTo(StartX,StartY);
                for(let BaseIndex=3;BaseIndex<ContourData.length;BaseIndex+=3){//始点の次の点から
                    const PatientX=ContourData[BaseIndex];
                    const PatientY=ContourData[BaseIndex+1];
                    //const PatientZ=ContourData[BaseIndex+2];
                    /*画像座標系に変換*/
                    const X=(this.width-1)*(PatientX-this.xMin)/(this.xMax-this.xMin);
                    const Y=(this.height-1)*(PatientY-this.yMin)/(this.yMax-this.yMin);
                    ContourPath.lineTo(X,Y);
                }
                ContourPath.closePath();
                //このROIの輪郭をまとめるROIContourDataMapにZをkeyとして登録する
                if(ROIContourDataMap.has(Z)){
                    const ExistingZPath=ROIContourDataMap.get(Z);
                    ExistingZPath.addPath(ContourPath);//すでにこの組織のZの輪郭があるので、そこにまとめる
                }else{//初めてのZ
                    ROIContourDataMap.set(Z,ContourPath);
                }
            }
            //ROIContourDataMapをContourDataMapに追加するKeyはROIName
            if(ROIContourDataMap.size>0){//輪郭が追加されていれば、少なくとも一つは表示しないといけない輪郭がある
                //Zの昇順となるようにソートしておく
                const SortedROIContourDataMap=new Map(Array.from(ROIContourDataMap.entries()).sort((a,b)=>a[0]-b[0]));
                this.ContourDataMap.set(ROIName,SortedROIContourDataMap);
            }
        }
        //ROINameごとの色を決定する
        //一緒にボタンの幅を決める
        const ROINameList=Array.from(this.ContourDataMap.keys());
        const ROINum=ROINameList.length;
        this.ContourColorMap=new Map();//{ROIName:"#RRBBGGAA"}
        this.LineAlpha=Math.round(255*0.8).toString(16).padStart(2,"0");
        this.FillAlpha=Math.round(255*0.2).toString(16).padStart(2,"0");
        const TextWidthMesureCanvas=document.createElement("canvas");
        /*
        const TextWidthMesureCanvasWidthCTX=TextWidthMesureCanvas.getContext("2d");
        const ButtonFontSize=15;
        const ButtonROINameTextFontStyle=`bold ${ButtonFontSize}px sans-serif`
        TextWidthMesureCanvasWidthCTX.font=ButtonROINameTextFontStyle;
        let ButtonTextMaxWidth=0;
        */
        for(const [n,ROIName] of ROINameList.entries()){
            //色相hを決定
            const h=360*(n/ROINum);
            const HexText=CONTOURclass.hsv2rgb(h);
            this.ContourColorMap.set(ROIName,HexText);
        }
        //ROISelectStatusSet集合内にあるROINameは描画する輪郭
        this.ROISelectStatusSet=new Set(ROINameList);//初期状態では全表示とする
        this.ROIMemoryStatusSet=new Set();//ROISelectSubWindowが閉じたときの状態をこちらで保持しておくためのもの
        //console.log(this.ContourColorMap);
        //console.log(this.ContourDataMap);
    }
    async draw(canvas,DrawStatus){
        const ctx=canvas.getContext("2d");
        ctx.imageSmoothingEnabled=false;
        const dx=0,dy=0,dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        const index=DrawStatus.get("index");
        ctx.clearRect(0,0,dWidth,dHeight);//初期化
        //座標系の移動・拡縮
        const sx=DrawStatus.get("w0");
        const sy=DrawStatus.get("h0");
        ctx.save();
        ctx.translate(dx,dy);
        ctx.scale(dWidth/DrawStatus.get("width"),dHeight/DrawStatus.get("height"));
        ctx.translate(-sx,-sy);
        //輪郭の描画
        for(const ROIName of this.ROISelectStatusSet){
            const ROIContourDataMap=this.ContourDataMap.get(ROIName);
            if(ROIContourDataMap.has(index)){
                const ContourPath=ROIContourDataMap.get(index);
                const ContourColorHexText=this.ContourColorMap.get(ROIName);
                ctx.strokeStyle=ContourColorHexText+this.LineAlpha;
                ctx.fillStyle=ContourColorHexText+this.FillAlpha;
                ctx.lineWidth=1;
                ctx.stroke(ContourPath);
                ctx.fill(ContourPath,"evenodd");
            }
        }
        ctx.restore();
    }
    ChangeROIStatusSet(data){
        /*this.ROISelectedStatusSetを更新する*/
        const ReceivedDataBody=data.get("data");
        const Mode=ReceivedDataBody.get("Mode");//冗長かもしれないが、ほかのデータタイプなどの引数の形式に合わせたかったからここでもう一度Modeを取得する
        const NewROIStatusSet=ReceivedDataBody.get("ROIStatusSet");
        if(Mode==="Select"){
            this.ROISelectStatusSet=NewROIStatusSet;
        }else if(Mode==="Memory"){
            this.ROIMemoryStatusSet=NewROIStatusSet;
        }
    }
    ChangeROISelect(data){
        const ReceivedDataBody=data.get("data");
        const ROIName=ReceivedDataBody.get("ROIName");
        const Selected=ReceivedDataBody.get("Selected");//trueなら追加、falseなら削除
        if(Selected){
            this.ROISelectStatusSet.add(ROIName);
        }else{
            this.ROISelectStatusSet.delete(ROIName);
        }
        //このROINameが存在するスライスの最小値、最大値を返す
        const ROIContourDataMap=this.ContourDataMap.get(ROIName);
        const SliceIndexArray=Array.from(ROIContourDataMap.keys());
        //console.log("SliceIndexArray",SliceIndexArray);
        //現時点ではKeyは昇順に並んでおらず、どうやら降順に並んでいるようだ
        const MinIndex=SliceIndexArray[0];
        const MaxIndex=SliceIndexArray[SliceIndexArray.length-1];
        return [MinIndex,MaxIndex];
    }
    getClickedROISet(ctx,Z,X,Y){
        //console.log("ClicekdXY",X,Y);
        //現在のthis.ROISelectStatusSet内にあるROIに対して判定を行う
        const ClickedROISet=new Set();
        for(const ROIName of this.ROISelectStatusSet){
            const ROIContourDataMap=this.ContourDataMap.get(ROIName);
            if(ROIContourDataMap.has(Z)){
                const ContourPath=ROIContourDataMap.get(Z);
                //X,YがContourPath内にあるか判定する。
                if(ctx.isPointInPath(ContourPath,X,Y,"evenodd")){
                    //含まれる
                    ClickedROISet.add(ROIName);
                }
            }
        }
        return ClickedROISet;
    }
}
//グローバル変数としてCanvasContainerを保持・グローバルスライドショーを紐づけ
const CanvasContainer = document.getElementById("CanvasContainer");
CanvasContainer.addEventListener("wheel",(e)=>{
    //登録されているCanvasのinputイベントを発火させる
    e.preventDefault();
    e.stopPropagation();
    const changevalue=Math.sign(e.deltaY);
    //console.log("Global Slice");
    for(const Canvas of CanvasClassDictionary.values()){
        const slider=Canvas.slider;
        const curretnvalue=parseInt(slider.value);
        const sliderlength=parseInt(slider.max)+1;
        slider.value=(curretnvalue+sliderlength+changevalue)%sliderlength;
        slider.dispatchEvent(new Event("input"));
    }
});
//線量分布を読み込むためのクラス
class DOSEclass{
    static DataType="DOSE";
    static PathTarget="openFile";
    static DefaultMultiSelections="";
    static FilePathCanvasIDDelimita=`<|${this.DataType}|>`;//このデータクラスでは (読み込むファイルパス)|(元となるCT画像のCanvasID) という形でパスを持つ
    static {
        this.InitializePathSelectDOMTree();
    }
    //DOMTreeのパーツと必要なイベントの設定
    static InitializePathSelectDOMTree(){
        const PathSelectDOMTree=document.createElement("div");
        PathSelectDOMTree.id=this.DataType;//CSSで個別設定をするために必要になる
        PathSelectDOMTree.className="PathSelectDOMTree";
        /*DataTypeのタイトル欄*/
        const TitleDiv=document.createElement("div");
        TitleDiv.className="DataTypeDisplay";
        TitleDiv.textContent=`${this.DataType} の読み込み`;
        PathSelectDOMTree.appendChild(TitleDiv);
        /*パスの指定コンテナ*/
        const PathSettingContainer=document.createElement("div");
        PathSettingContainer.className="FilePathInputWithCanvasIDSelectSettingContainer";
        //1. modeセレクトボタン
        const ModeSelectContainer=document.createElement("div");
        ModeSelectContainer.className="ModeSelectContainer";
        const NewModeButton=document.createElement("button");
        NewModeButton.setAttribute("data-SelectMode","New");
        NewModeButton.textContent="新規";
        const ExistingModeButton=document.createElement("button");
        ExistingModeButton.setAttribute("data-SelectMode","Existing");
        ExistingModeButton.textContent="既存";
        ModeSelectContainer.appendChild(NewModeButton);
        ModeSelectContainer.appendChild(ExistingModeButton);
        PathSettingContainer.appendChild(ModeSelectContainer);
        //2. PathInputContainer
        const PathInputContainer=document.createElement("div");
        PathInputContainer.className="PathInputContainer";
        const NewPathContainer=document.createElement("div");
        NewPathContainer.classList.add("PathContainer");//パーツ名
        //NewPathContainer.classList.add("FilePathInput");//入力方法
        NewPathContainer.setAttribute("data-SelectMode","New");
        //ファイルパス参照＆入力部分
        const LoadPathParts=document.createElement("div");
        LoadPathParts.className="LoadPathParts";
        const NewPathInputText=document.createElement("input");
        NewPathInputText.className="NewPathInputText";
        NewPathInputText.type="text";
        NewPathInputText.placeholder="新しく読み込むデータのパスを入力...";
        const OpenFileDialogButton=document.createElement("button");
        OpenFileDialogButton.className="OpenFildDialogButton";
        OpenFileDialogButton.textContent="参照";
        OpenFileDialogButton.setAttribute("data-MultipleSelections",this.DefaultMultiSelections);//このDomに複数選択状態を設定しておくことでその都度切り替えられるようにする
        LoadPathParts.appendChild(NewPathInputText);
        LoadPathParts.appendChild(OpenFileDialogButton);
        //元となったCT画像をCanvasIDから選択するセレクタ部分
        const ReferOriginalParts=document.createElement("div");
        ReferOriginalParts.className="ReferOriginalParts";
        const ReferOriginalPathInputSelecter=document.createElement("select");
        ReferOriginalParts.appendChild(ReferOriginalPathInputSelecter);
        NewPathContainer.appendChild(LoadPathParts);
        NewPathContainer.appendChild(ReferOriginalParts);
        PathInputContainer.appendChild(NewPathContainer);

        //既存のデータの参照を指定する部分。セレクターはこの時点では空としておき、起動時にoptionを設定する。
        //選択肢はCanvasIDとする(CanvasID＝？に映ってるCT画像をこっちのCanvasIDでも表示させたい、のようなイメージ)
        const ExistingPathContainer=document.createElement("div");
        ExistingPathContainer.classList.add("PathContainer");//パーツ名
        //ExistingPathContainer.classList.add("ExistingCanvasIDSelect");//入力方法
        ExistingPathContainer.setAttribute("data-SelectMode","Existing");
        const ExistingPathInputSelecter=document.createElement("select");
        ExistingPathInputSelecter.className="ExistingPathInputSelecter";
        ExistingPathContainer.appendChild(ExistingPathInputSelecter);
        PathInputContainer.appendChild(ExistingPathContainer);
        PathSettingContainer.appendChild(PathInputContainer);
        PathSelectDOMTree.appendChild(PathSettingContainer);
        //これはLoadAndLayoutなどから要請されて外部に渡したりする。
        //そのとき、ExistingPathInputSelecterのOptionを再構成して渡す
        this.OpenFileDialogButton=OpenFileDialogButton;//複数選択か単数選択かをセットしたり、確認する必要があるから
        this.ModeSelectContainer=ModeSelectContainer;//Selectedクラスの有無を確かめる必要があるから
        this.NewPathInputText=NewPathInputText;
        this.ReferOriginalPathInputSelecter=ReferOriginalPathInputSelecter;
        this.ExistingPathInputSelecter=ExistingPathInputSelecter;
        this.PathSelectDOMTree=PathSelectDOMTree;
        const TabIndexTargetArray=[NewModeButton,ExistingModeButton,NewPathInputText,OpenFileDialogButton,ReferOriginalPathInputSelecter,ExistingPathInputSelecter];
        TabIndexTargetArray.forEach((element)=>element.tabIndex="-1");
        //console.dir(this.PathSelectDOMTree);
        /*OpenFileDialogButtonにイベントを設定する*/
        this.OpenFileDialogButton.addEventListener("mouseup",async (e)=>{
            if(e.button===0){//左クリックなら
                //属性値を取得
                const MultipleSelections=e.target.getAttribute("data-MultipleSelections");//"multipleSelections" or "" になるはず
                const PathTarget=this.PathTarget;
                const DialogTitle=`${this.DataType} 選択ダイアログ`;
                const SelectedPathList=await LoadAndLayout.SelectPathes(DialogTitle,PathTarget,MultipleSelections);//[]リストみたいな形式
                //SelectedPathListはリストで帰ってくることもあれば単一文字列で帰ってくることもあるが、showOpenDialogはかならず[filepath,...]の形式でパス文字列を返すのでfor文を回して良し
                /*
                ここではパスの選択は行うが読み込みはまだ行わない。現在読み込んだパスの配列を", "で結合してtextに表示する
                */
                this.NewPathInputText.value=SelectedPathList.join(", ");
            }
        });
        /*
        ModeSelectContainer内のボタンにイベントを付与
        */
        this.ModeSelectContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                const button=e.target;
                if(button.tagName==="BUTTON"){
                    //押されたbuttonにSelectedクラスが付与されているか
                    if(button.classList.contains("Selected")){
                        //押されているのでbuttonからSelectedを解除して、ModeSelectContainerのmode属性値を空白にする
                        button.classList.remove("Selected");
                        this.ModeSelectContainer.setAttribute("data-SelectMode","");
                    }else{
                        //まずは直下のbutton全てからSelectedを取り除く
                        const ButtonList=this.ModeSelectContainer.querySelectorAll(":scope>button");
                        ButtonList.forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        button.classList.add("Selected");
                        const modeAttribute=button.getAttribute("data-SelectMode");
                        this.ModeSelectContainer.setAttribute("data-SelectMode",modeAttribute);
                    }
                }
            }
        });
        /*
        PathInputContainerにクリックイベントを付与
        マウスダウン時にPathContainerまで辿っていく
        */
        PathInputContainer.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //e.targetから親を辿る
                const PathContainer=e.target.closest("div.PathContainer");
                if(PathContainer){
                    const PathContainerSelectMode=PathContainer.getAttribute("data-SelectMode");
                    const ModeSelectContainerSelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
                    if(PathContainerSelectMode!==ModeSelectContainerSelectMode){
                        //変更する必要あり
                        this.ModeSelectContainer.querySelectorAll(":scope>button").forEach((button)=>{
                            button.classList.remove("Selected");
                        });
                        //PathContainerSelectModeと同じ属性値を持つButtonを取得
                        const SelectedButton=this.ModeSelectContainer.querySelector(`:scope>button[data-SelectMode="${PathContainerSelectMode}"]`);
                        if(SelectedButton){
                            SelectedButton.classList.add("Selected");
                            this.ModeSelectContainer.setAttribute("data-SelectMode",PathContainerSelectMode);
                        }
                    }
                }
            }
        });
        /*
        PathSelectDOMTree.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //クリックされたパスコンテナを取得
                const ClickedPathContainer=e.target.closest("div.PathContainer");
                //このパスコンテナのクラスリストをチェックして選択済みかどうか確認
                if(ClickedPathContainer.classList.contains("Selected")){
                    //既に選択されている状態で押されたことになるので、選択を解除する
                    ClickedPathContainer.classList.remove("Selected");
                }else{
                    //まずは全てのPathContainerからSelectedを解除
                    const PathContainerList=this.PathSelectDOMTree.querySelectorAll(":scope>div.PathContainer");
                    PathContainerList.forEach((PathContainer)=>{
                        PathContainer.classList.remove("Selected");
                    });
                    //クリックされたものだけSelected
                    ClickedPathContainer.classList.add("Selected");
                }
            }
        });
        */

    }
    //LoadAndLayoutにDOMTreeを渡す
    static setPathSelectDOMTree(TargetCanvasID=99999,MultipleSelections=this.DefaultMultiSelections){
        /*
        外部から要請を受けてDOMTreeを渡す。
        */
        //状況によって複数パス選択可能か否か変動するため、これが呼ばれるたびにOpenFileDialogのAttributeを更新する
        this.OpenFileDialogButton.setAttribute("data-MultipleSelections",MultipleSelections);
        //ReferOriginalPathInputSelecterを更新し、CT画像を持つCanvasIDとパスを表示する
        this.ReferOriginalPathInputSelecter.innerHTML="";
        const ReferOriginalPathInputSelecterInitialOption=document.createElement("option");
        ReferOriginalPathInputSelecterInitialOption.text="元のCTを選択";
        ReferOriginalPathInputSelecterInitialOption.value=(-99999);
        ReferOriginalPathInputSelecterInitialOption.disabled=true;
        ReferOriginalPathInputSelecterInitialOption.hidden=true;
        ReferOriginalPathInputSelecterInitialOption.selected=true;
        const ReferOriginalPathInputSelecterFragment=document.createDocumentFragment();
        ReferOriginalPathInputSelecterFragment.appendChild(ReferOriginalPathInputSelecterInitialOption);
        const ReferOriginalPathInputSelecterDataIDCanvasIDListMap=new Map();//{CanvasID:DataID}
        //Path入力欄の初期化
        this.NewPathInputText.value="";
        //ExistingPathInputSelecterのOptionを更新する
        this.ExistingPathInputSelecter.innerHTML="";//初期化
        const ExistingPathInputSelecterInitialOption=document.createElement("option");
        ExistingPathInputSelecterInitialOption.text="既にあるDataIDを選択...";
        ExistingPathInputSelecterInitialOption.value=(-99999);
        ExistingPathInputSelecterInitialOption.disabled=true;//選択不可
        ExistingPathInputSelecterInitialOption.hidden=true;//選択肢から除外
        ExistingPathInputSelecterInitialOption.selected=true;//初期表示
        //CanvasClassのthis.DataTypeをチェックしていく
        const ExistingPathInputSelecterFragment=document.createDocumentFragment();//仮想DOM
        ExistingPathInputSelecterFragment.appendChild(ExistingPathInputSelecterInitialOption);
        const ExistingPathInputSelecterDataIDCanvasIDListMap=new Map();
        const CONTOURDataType=this.DataType;
        const CTDataType=CTclass.DataType;
        let DefaultOriginalCTDataID=-99999;
        for(const [CanvasID,Canvas] of CanvasClassDictionary.entries()){
            if(Canvas.LayerDataMap.has(CONTOURDataType)){
                const DataID=Canvas.LayerDataMap.get(CONTOURDataType).get("DataID");
                /*
                const option=document.createElement("option");
                option.text=`DataID:${DataID}(CanvasID:${CanvasID}) ${Path}`;
                option.value=DataID;
                fragment.appendChild(option);
                */
                if(ExistingPathInputSelecterDataIDCanvasIDListMap.has(DataID)){
                    ExistingPathInputSelecterDataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    ExistingPathInputSelecterDataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
            }
            if(Canvas.LayerDataMap.has(CTDataType)){
                const DataID=Canvas.LayerDataMap.get(CTDataType).get("DataID");
                if(ReferOriginalPathInputSelecterDataIDCanvasIDListMap.has(DataID)){
                    ReferOriginalPathInputSelecterDataIDCanvasIDListMap.get(DataID).push(CanvasID);
                }else{
                    ReferOriginalPathInputSelecterDataIDCanvasIDListMap.set(DataID,[CanvasID]);
                }
                //DataIDがデフォルト選択にするものかチェック
                if(CanvasID===TargetCanvasID){
                    DefaultOriginalCTDataID=DataID;
                }
            }
        }
        console.log(TargetCanvasID,MultipleSelections);
        //既存セレクタの再構成
        for(const [DataID,CanvasIDList] of ExistingPathInputSelecterDataIDCanvasIDListMap.entries()){
            const option=document.createElement("option");
            option.text=`DataID: ${DataID} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            ExistingPathInputSelecterFragment.appendChild(option);
        }
        this.ExistingPathInputSelecter.appendChild(ExistingPathInputSelecterFragment);
        //オリジナルとなるCTセレクタの再構成
        for(const [DataID,CanvasIDList] of ReferOriginalPathInputSelecterDataIDCanvasIDListMap.entries()){
            const option=document.createElement("option");
            const Path=DicomDataClassDictionary.get(CTclass.DataType).get(DataID).get("Data").Path;
            option.text=`DataID:${DataID} ${Path} ( CanvasID= ${CanvasIDList.join(", ")} )`;
            option.value=DataID;
            ReferOriginalPathInputSelecterFragment.appendChild(option);
        }
        /*
        for(const [CanvasID,DataID] of ReferOriginalPathInputSelecterCanvasIDDataIDMap.entries()){
            const option=document.createElement("option");
            const Path=DicomDataClassDictionary.get(CTclass.DataType).get(DataID).get("Data").Path;
            option.text=`CanvasID:${CanvasID} ${Path}`;
            option.value=DataID;
            ReferOriginalPathInputSelecterFragment.appendChild(option);
        }
        */
        this.ReferOriginalPathInputSelecter.appendChild(ReferOriginalPathInputSelecterFragment);
        if(DefaultOriginalCTDataID>=0){
            this.ReferOriginalPathInputSelecter.value=DefaultOriginalCTDataID;
        }
        //ModeSelectButtonを初期化する
        this.ModeSelectContainer.setAttribute("data-SelectMode","");
        const ModeSelectButtonArray=this.ModeSelectContainer.querySelectorAll(":scope>button.Selected");
        for(const button of ModeSelectButtonArray){
            button.classList.remove("Selected");
        }
        return this.PathSelectDOMTree;
    }
    /*
    static makeInfoText(LoadPath){
        return LoadPath;
    }
    */

    static async DataLoader(loadPath){
        //CTclass用のパス読み込み静的関数
        //戻り値の形式はこのコンストラクターが受け付けるものとする
        const LoadingResult=await LoadAndLayout.LoadFiles(loadPath);
        return LoadingResult;//一度外部で読み込まれたかのチェックを受けてからコンストラクタに入る
    }

    static async Loading(LoadPathList=[]){
        /*
        makeInfoTextの戻り値と同じ形式のリスト(複数選択対応)を受け取る
        戻り値は
        [DataID,...,DataID]とする。
        複数選択された際、すべてのDataType,DataIDが完璧に読み込めた場合のみ戻り値を返し、
        一つでも不備がある場合はfalseを返すこととする。
        */
        if(LoadPathList.length==0){
            //console.log("選択されませんでした");
            return false;
        }else{
            const DataInfoList=[];
            for(const LoadPath of LoadPathList){
                //console.log(LoadPath);
                const [FilePath,DataIDstr]=LoadPath.split(this.FilePathCanvasIDDelimita);
                const NewLoadedData=await this.DataLoader(FilePath);
                /*
                const CanvasID=parseInt(CanvasIDstr);
                const OriginalCTCanvas=CanvasClassDictionary.get(CanvasID);
                const OriginalCTDataID=OriginalCTCanvas.LayerDataMap.get(CTclass.DataType).get("DataID");
                */
                const OriginalCTDataID=parseInt(DataIDstr);
                //console.log(OriginalCTDataID);
                const _DicomDataClass=DicomDataClassDictionary.get(CTclass.DataType);
                const _OriginalCTData=_DicomDataClass.get(OriginalCTDataID);
                const _CTData=_OriginalCTData.get("Data");
                const OriginalCTData=DicomDataClassDictionary.get(CTclass.DataType).get(OriginalCTDataID).get("Data");
                if(NewLoadedData&&OriginalCTData){//ちゃんと読み込めているか
                    //OriginalCTの参照はコンストラクタ内でもできるが、コンストラクタが走るとエラーに関わらずインスタンスが生成されるような気がするので、確実に完了させるために事前にチェックする方策をとる
                    const LoadedData=new Map([
                        ["NewLoadedData",NewLoadedData],
                        ["OriginalCTData",OriginalCTData]//サイズ関連のデータをconstructerで参照する
                    ]);
                    const DataType=this.DataType;
                    const DicomData=new this(LoadPath,LoadedData);
                    const NewDataID=DicomNextID.get(DataType);
                    DicomNextID.set(DataType,NewDataID+1);
                    const DicomDataMap=new Map([
                        ["Data",DicomData],
                        ["RefCount",0]
                    ]);
                    DicomDataClassDictionary.get(DataType).set(NewDataID,DicomDataMap);
                    DataInfoList.push(NewDataID);
                }else{
                    return false;
                }
            }
            return DataInfoList;
        }
    }
    //LoadAndLayoutからデータの読み込みが命令された。データの差し替えや一括読み込みからの経路
    static async LoadingFromDialog(){
        const SelectMode=this.ModeSelectContainer.getAttribute("data-SelectMode");
        if(SelectMode==="Existing"){
            const DataID=parseInt(this.ExistingPathInputSelecter.value);
            if(DataID>=0){
                //const SelectedCanvas=CanvasClassDictionary.get(SelectedCanvasID);
                //const DataID=SelectedCanvas.LayerDataMap.get(this.DataType).get("DataID");
                return [DataID];//Loadingの戻り値の形式に一致させる
            }
        }else if(SelectMode==="New"){
            //CONTOURはセレクタにてCanvasIDの指定もされているのでそれと合わせたパス文字列を生成する
            const PathText=this.NewPathInputText.value;
            const OriginalCTDataID=this.ReferOriginalPathInputSelecter.value;
            const LoadPathList=PathText.split(", ").map(path=>`${path}${this.FilePathCanvasIDDelimita}${OriginalCTDataID}`);//複数読み込みを禁止しているので必ず長さ1の配列になるはず
            //一応個数チェック
            if(LoadPathList.length!=1){
                console.log(this.DataType,"読み込み時エラー パスが複数あり",LoadPathList);
                return false;
            }
            //FilePath|CanvasIDという形式の文字列を渡す
            const DataIDList=await this.Loading(LoadPathList);
            return DataIDList;
        }
        return false;
    }
    static ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap){
        /*
        変更前のPathのArrayが送られてくるので、それらを変更した新しいArrayを返す.
        CONTOURはPath変換＆DataID変換が必要
        CONTOURPathの形式はPath:DataID
        DOSEも同様なのでCONTOURの流用
        */
        const NewPathArray=[];
        for(let i=0;i<OldPathArray.length;i++){
            let Before2MiddlePath=OldPathArray[i];
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const BeforePattern=BeforeAndAfterPatternMap.get("Before");
                Before2MiddlePath=Before2MiddlePath.replace(BeforePattern,MiddlePattern);
            }
            NewPathArray.push(Before2MiddlePath);
        }
        const TargetDataTypeOld2NewDataIDMap=Old2NewDataIDMap.get(CTclass.DataType);
        for(let i=0;i<NewPathArray.length;i++){
            let Middle2AfterPath=NewPathArray[i];
            let [Middle2AfterFilePath,Middle2AfterDataIDstr]=Middle2AfterPath.split(this.FilePathCanvasIDDelimita);
            for(const [MiddlePattern,BeforeAndAfterPatternMap] of PatternTargetMap.entries()){
                const AfterPattern=BeforeAndAfterPatternMap.get("After");
                Middle2AfterFilePath=Middle2AfterFilePath.replace(MiddlePattern,AfterPattern);
            }
            const NewDataID=TargetDataTypeOld2NewDataIDMap.get(parseInt(Middle2AfterDataIDstr));
            NewPathArray[i]=[Middle2AfterFilePath,NewDataID].join(this.FilePathCanvasIDDelimita);
        }
        return NewPathArray;
    }
    /*適したレイヤーを生成する*/
    static LayerZindex=LayerPriorityMap.get(this.DataType);
    static GetNewLayer(){
        const NewLayer=document.createElement("canvas");
        NewLayer.style.zIndex=this.LayerZindex;
        return NewLayer;
    }
    static SetUniqueFunctions(CanvasID){
        console.log("DOSEclassには固有関数はありません");
    }
    static JetColorMap(t){
        //0~1となっているtを受け取り、RGBAの配列を返す。この時、値は0～255となる
        let R=0,G=0,B=0,A=0;
        if(t!==0){
            R=255*Math.max(0,Math.min(1.5-Math.abs(4*t-3),1));
            G=255*Math.max(0,Math.min(1.5-Math.abs(4*t-2),1));
            B=255*Math.max(0,Math.min(1.5-Math.abs(4*t-1),1));
            A=255*0.3;
        }
        return [R,G,B,A];
    }
    constructor(loadPath,loadedData){
        this.Path=loadPath;
        const DicomData=loadedData.get("NewLoadedData")[0]["dataset"];//かならずシングルロードだから
        const OriginalCTData=loadedData.get("OriginalCTData");
        //OriginalCTDataからサイズに関する情報をもらう
        /*画像座標系の情報*/
        this.width=OriginalCTData.width;//画像座標系の幅
        this.height=OriginalCTData.height;//画像座標系の高さ
        this.depth=OriginalCTData.depth;//スライス枚数
        /*患者座標系の情報*/
        this.xMin=OriginalCTData.xMin;
        this.xMax=OriginalCTData.xMax;
        this.yMin=OriginalCTData.yMin;
        this.yMax=OriginalCTData.yMax;
        this.zMin=OriginalCTData.zMin;
        this.zMax=OriginalCTData.zMax;
        this.imagesize=OriginalCTData.imagesize;
        /*画像座標スライスインデックスと患者座標ｚ軸の相互変換*/
        this.i2p=OriginalCTData.i2p;
        this.p2i=OriginalCTData.p2i;
        this.ySpacing=OriginalCTData.ySpacing;
        this.xSpacing=OriginalCTData.xSpacing;
        this.currentImageBitmap=null;
        /*
        RT Doseからサイズやピクセルデータを抽出
        必要なデータ
        1．ピクセルデータ
        2．位置合わせに必要な座標データ(CTのどこにあたる部分がこのデータの始点か、X,Yのスペーシング、解像度、Z座標など)
        座標系
        (0020,0032) Image Position
        (0020,0037) Image Orientation
        (3004,000C) Grid Frame Offset Vector
        (0020,0052) Frame of Reference UID
        グリッド形状
        (0028,0030) Pixel Spacing
        (0028,0010)/(0028,0011) Rows/Columns
        (0028,0008) Number of Frames
        線量値
        (3004,0002) Dose Units
        (3004,0004) Dose Type
        (3004,000E) Dose Grid Scaling
        (7FE0,0010) Pixel Data
        */
        //CTの情報から、CTGridの座標がわかるので、これをもとにDoseGridをCTGridに補完していく。補完手法はEclipseなるモノでも使われている方法を採用
        //ippの抽出
        const ipp=DicomData.string("x00200032").split("\\").map(parseFloat);//Dose配列(0,0,0,)が患者座標系のどこにあるか[x,y,z]のならび
        console.log(ipp);
        //iopの抽出
        const iop=DicomData.string("x00200037").split("\\").map(parseFloat);//各軸の方向ベクトル(rowX rowY rowZ colX colY colZ)
        const iopXvector=[iop[0],iop[3]];
        const iopYvector=[iop[1],iop[4]];
        const iopZvector=[iop[2],iop[5]];
        
        //Grid Frame Offset Vector,
        const GridFrameOffsetVectorArray=DicomData.string("x3004000c").split("\\").map(parseFloat);//[?mm, ?mm, ?mm,...]これはつまり、index⇒mmの対応になっている。しかし、座標で昇順か降順かわからない状態である
        //const DOSEp2i=new Map([..._DOSEp2i].sort((a,b)=>a[0]-b[0]));//これで、p1:i1<p2:i2<...になった。
        const NumberOfFrames=DicomData.intString("x00280008");
        const GOVALength=GridFrameOffsetVectorArray.length;
        //Pixel Spacing, Rows, Columns
        const PixelSpacing=DicomData.string("x00280030").split("\\").map(parseFloat);//[dx,dy]
        const DosePixelRows=DicomData.uint16("x00280010");//行数＝画像の高さ
        const DosePixelColumns=DicomData.uint16("x00280011");//列数＝画像の幅
        //Dose Grid Scaling PixelDataにこれを乗算することで正式な線量値となる
        const DoseGridScaling=parseFloat(DicomData.string("x3004000e"));
        //Dose PixelDataの抽出
        const pixelElement=DicomData.elements.x7fe00010;
        const pixelBuffer=new DataView(DicomData.byteArray.buffer,pixelElement.dataOffset,pixelElement.length);
        const bitsAllocated=DicomData.uint16("x00280100");
        const bitsStored=DicomData.uint16("x00280101");
        //const HighBit=DiccomData.uint16("x00280102");
        const isSigned=DicomData.uint16("x00280103")===1;
        //console.log(bitsAllocated,bitsStored,isSigned);
        let getDoseValueFunction=null;
        if(bitsAllocated===8){
            if(isSigned){
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt8(byte,true);
            }else{
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true);
            }
        }else if(bitsAllocated===16){
            if(isSigned){
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt16(2*byte,true);
            }else{
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint16(2*byte,true);
            }
        }else if(bitsAllocated===32){
            if(isSigned){
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getInt32(4*byte,true);
            }else{
                getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint32(4*byte,true);
            }
        }else{
            getDoseValueFunction=(pixelBuffer,byte)=>pixelBuffer.getUint8(byte,true)
        }
        //ここはスライスごとの配列として一度保持する。
        //場合によっては、スライスのインデックスが増えるごとにZが小さくなる場合も考えられるため、スライスごとに保持した後Zが昇順、つまり、インデックスが増加するごとにZが大きいスライスが来るようにSortする
        //const DoseVolumeSize=NumberOfFrames*DosePixelRows*DosePixelColumns;
        const DoseSliceSize=DosePixelRows*DosePixelColumns;
        const DoseSliceMap=new Map();//mmをKeyとして、そのスライスデータを保持する
        for(const [Zindex,ZOfset] of GridFrameOffsetVectorArray.entries()){
            const DoseSliceArray=new Float32Array(DoseSliceSize);
            /*
            for(let SliceIndex=0;SliceIndex<DoseSliceSize;SliceIndex++){
                const pixelBufferIndex=Zindex*DoseSliceSize+SliceIndex;
                console.log(pixelBufferIndex);
                DoseSliceArray[SliceIndex]=getDoseValueFunction(pixelBuffer,pixelBufferIndex);
            }
            */
            for(let Hindex=0;Hindex<DosePixelRows;Hindex++){
                for(let Windex=0;Windex<DosePixelColumns;Windex++){
                    const PixelBufferIndex=(Zindex*DosePixelRows+Hindex)*DosePixelColumns+Windex;
                    DoseSliceArray[Hindex*DosePixelColumns+Windex]=getDoseValueFunction(pixelBuffer,PixelBufferIndex);
                }
            }
            console.log(ZOfset);
            DoseSliceMap.set(ipp[2]+ZOfset,DoseSliceArray);
        }
        //DoseSliceMapを患者座標系Zmmが昇順になるようにソートする
        //CTやMASKは頭⇒足で+⇒-となる。これがLPSの標準なので、これもそれに従うよって、大⇒小とZ座標が並ぶ
        const SortedDoseSliceMap=new Map([...DoseSliceMap].sort((a,b)=>b[0]-a[0]));//a<bという状態になってしまっているなら、入れ替えるというルール
        const DOSEZPositionArray=Array.from(SortedDoseSliceMap.keys());
        //console.log(DOSEZPositionArray);
        //console.log(Array.from(this.i2p.values()));
        const MaxDOSEZPosition=DOSEZPositionArray[0];
        const MinDOSEZPosition=DOSEZPositionArray[DOSEZPositionArray.length-1];
        const SortedDoseSliceZPositionSliceArray=[...SortedDoseSliceMap];//[[mm,SliceArray],...,]
        let SortedDoseZPositionPointa=0;//CTZPositionが収まる区間を探すのに使う
        const MaxSortedDoseZPositionPointa=SortedDoseSliceZPositionSliceArray.length-2;
        const MinDOSEHPosition=ipp[1];
        const MaxDOSEHPosition=MinDOSEHPosition+PixelSpacing[1]*(DosePixelRows-1);
        const MinDOSEWPosition=ipp[0];
        const MaxDOSEWPosition=MinDOSEWPosition+PixelSpacing[0]*(DosePixelColumns-1);
        //補完してCTボリュームと同じサイズにする
        this.ImageVolume=new Float32Array(this.depth*this.height*this.width);
        this.ImageVolume.fill(0);//何もなければ線量値0となる
        //console.log(this.i2p);
        //console.log(SortedDoseSliceZPositionSliceArray);
        //最大値と最小値も調べておく
        let vMin=Infinity;
        let vMax=(-Infinity);
        for(let CTZindex=0;CTZindex<this.depth;CTZindex++){
            const CTZPosition=this.i2p.get(CTZindex);
            if(MinDOSEZPosition<=CTZPosition&&CTZPosition<=MaxDOSEZPosition){
                //CTZPositionを挟み込んでいる区間を探す
                let DOSEBiggerZ=SortedDoseSliceZPositionSliceArray[SortedDoseZPositionPointa];//[mm,Array]インデックスが若いほど座標が大きい
                let DOSEBiggerZPosition=DOSEBiggerZ[0];
                let DOSESmallerZ=SortedDoseSliceZPositionSliceArray[SortedDoseZPositionPointa+1];
                let DOSESmallerZPosition=DOSESmallerZ[0];
                while(SortedDoseZPositionPointa<MaxSortedDoseZPositionPointa&&!(DOSESmallerZPosition<=CTZPosition&&CTZPosition<=DOSEBiggerZPosition)){
                    SortedDoseZPositionPointa++;
                    DOSEBiggerZ=SortedDoseSliceZPositionSliceArray[SortedDoseZPositionPointa];//[mm,Array]
                    DOSEBiggerZPosition=DOSEBiggerZ[0];
                    DOSESmallerZ=SortedDoseSliceZPositionSliceArray[SortedDoseZPositionPointa+1];
                    DOSESmallerZPosition=DOSESmallerZ[0];
                }
                
                //これから、DOZEIndexの小数値を獲得する
                const CT2DOSEZIndex=(DOSEBiggerZPosition-CTZPosition)/(DOSEBiggerZPosition-DOSESmallerZPosition)+SortedDoseZPositionPointa;//これでN＋αというインデックス上の小数が得られた。この小数点以下の部分が補完時の重みとなる
                //console.log(`${DOSEBiggerZPosition}, ${CTZPosition}, ${DOSESmallerZPosition} -> ${CT2DOSEZIndex} (${SortedDoseZPositionPointa})`);
                const Z0=SortedDoseZPositionPointa;
                const Z1=Z0+1;
                const ZDecimalPart=(DOSEBiggerZPosition-CTZPosition)/(DOSEBiggerZPosition-DOSESmallerZPosition);
                //スライスごとに別に管理しているからこうしてもよい
                //しかし、スライスは完全にFlattenしているので、H,Wではこのようにはできない
                const Z0Slice=SortedDoseSliceZPositionSliceArray[Z0][1];
                const Z1Slice=SortedDoseSliceZPositionSliceArray[Z1][1];
                //console.log(`${DOSEBiggerZPosition}, ${CTZPosition}, ${DOSESmallerZPosition} -> ${CT2DOSEZIndex} | ${Z0},${Z1} (${ZDecimalPart})`);
                for(let CTHindex=0;CTHindex<this.height;CTHindex++){
                    const CTHPosition=this.yMin+CTHindex*this.ySpacing;
                    if(MinDOSEHPosition<=CTHPosition&&CTHPosition<=MaxDOSEHPosition){
                        //CTHPositionを基にDOSEのインデックスのどこにあるかを計算する
                        const CT2DOSEHIndex=(CTHPosition-MinDOSEHPosition)/PixelSpacing[1];
                        const H0=Math.floor(CT2DOSEHIndex);
                        const H1=H0+1;
                        const HDecimalPart=CT2DOSEHIndex-H0;
                        for(let CTWindex=0;CTWindex<this.width;CTWindex++){
                            const CTWPosition=this.xMin+CTWindex*this.xSpacing;
                            if(MinDOSEWPosition<=CTWPosition&&CTWPosition<=MaxDOSEWPosition){
                                const CT2DOSEWIndex=(CTWPosition-MinDOSEWPosition)/PixelSpacing[0];
                                const W0=Math.floor(CT2DOSEWIndex);
                                const W1=W0+1;
                                const WDecimalPart=CT2DOSEWIndex-W0;//小数部分
                                /*
                                ここから３次元線形変換
                                命名規則
                                Z0,H0,W1の値⇒v001
                                */
                                const H0W0Index=H0*DosePixelColumns+W0;
                                const H0W1Index=H0*DosePixelColumns+W1;
                                const H1W0Index=H1*DosePixelColumns+W0;
                                const H1W1Index=H1*DosePixelColumns+W1;
                                const v000=Z0Slice[H0W0Index];
                                const v001=Z0Slice[H0W1Index];
                                const v010=Z0Slice[H1W0Index];
                                const v011=Z0Slice[H1W1Index];
                                const v100=Z1Slice[H0W0Index];
                                const v101=Z1Slice[H0W1Index];
                                const v110=Z1Slice[H1W0Index];
                                const v111=Z1Slice[H1W1Index];
                                //console.log(v000,v001,v010,v011,v100,v101,v110,v111);
                                /*X方向の線形補完*/
                                const Xweight0=1-WDecimalPart;
                                const Xweight1=WDecimalPart;
                                const v00=Xweight0*v000+Xweight1*v001;
                                const v01=Xweight0*v010+Xweight1*v011;
                                const v10=Xweight0*v100+Xweight1*v101;
                                const v11=Xweight0*v110+Xweight1*v111;
                                /*Y方向の線形補完*/
                                const Yweight0=1-HDecimalPart;
                                const Yweight1=HDecimalPart;
                                const v0=Yweight0*v00+Yweight1*v01;
                                const v1=Yweight0*v10+Yweight1*v11;
                                /*W方向の線形補完*/
                                const Zweight0=1-ZDecimalPart;
                                const Zweight1=ZDecimalPart;
                                const ComplementValue=Zweight0*v0+Zweight1*v1;
                                const DoseValue=ComplementValue*DoseGridScaling;
                                //console.log(DoseValue);
                                //最終的な補完値を格納する
                                if(vMin>DoseValue){
                                    vMin=DoseValue;
                                }
                                if(vMax<DoseValue){
                                    vMax=DoseValue;
                                }
                                this.ImageVolume[(CTZindex*this.height+CTHindex)*this.width+CTWindex]=DoseValue;
                            }
                        }
                    }
                }
            }
        }
        console.log("DOSE準備完了");
        this.vMin=vMin;
        this.vMax=vMax;
        console.log(vMin,vMax);
    }
    async draw(canvas,DrawStatus){
        const ctx=canvas.getContext("2d");
        ctx.imageSmoothingEnabled=false;
        const dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        ctx.clearRect(0,0,dWidth,dHeight);
        //vMin,vMaxは階調時に変更され、そのあと再描画させることで反映される
        //console.log("呼ばれたよ");
        if(DrawStatus.get("regenerate")){
            if(this.currentImageBitmap){
                this.currentImageBitmap.close();
            }
            //新しいImageBitMapを作成して保持
            this.currentImageBitmap= await this.CreateImageBitmap(DrawStatus.get("index"));
            //console.log("Bitmap",this.currentImageBitmap);
            //DrawStatus.set("regenerate",false);
        }
        //保存されたImageBitMapを描画する
        if(this.currentImageBitmap){
            ctx.drawImage(
                this.currentImageBitmap,
                DrawStatus.get("w0"),DrawStatus.get("h0"),DrawStatus.get("width"),DrawStatus.get("height"),
                0,0,dWidth,dHeight
            );
        }
    }
    CreateImageBitmap(index){
        //console.log("CTクラスだよ");
        const rgbArray=new Uint8ClampedArray(this.imagesize*4);
        for(let i=0;i<this.imagesize;i++){
            const baseindex=i*4;
            const DoseValue=(this.ImageVolume[index*this.imagesize+i]-this.vMin)/(this.vMax-this.vMin);
            const [R,G,B,A]=this.constructor.JetColorMap(DoseValue);
            rgbArray[baseindex]=R;//R
            rgbArray[baseindex+1]=G;//G
            rgbArray[baseindex+2]=B;//B
            rgbArray[baseindex+3]=A;//A
        }
        //console.log(this.width,this.height);
        const imageData=new ImageData(rgbArray,this.width,this.height);
        //console.log("imageData",imageData);
        return createImageBitmap(imageData);
    }
}
class Canvas{
    static EventSetHelper(CanvasID,element,event,callback){
        try{
            const CanvasInstance=CanvasClassDictionary.get(CanvasID);
            element.addEventListener(event,callback);
            //ElementsWithEventsに登録
            if(CanvasInstance.ElementsWithEvents.has(element)){
                //すでにエレメントが一度登録されている
                const elementMap=CanvasInstance.ElementsWithEvents.get(element);
                if(elementMap.has(event)){
                    //エレメントのeventが一度登録されている
                    elementMap.get(event).push(callback);
                }else{
                    //このイベントは初めてなので新しい配列を作って登録
                    elementMap.set(event,[callback]);
                }
            }else{
                //この要素が初めてなのでエレメントのMapを登録⇒eventのMAPを登録⇒callbackをプッシュする
                CanvasInstance.ElementsWithEvents.set(element,new Map([
                    [event,[callback]]
                ]));
            }
        }catch(error){
            //console.log(element,event);
            //console.log(`EventSettingError\n${error}`);
        }
    }
    /*サブウィンドウ関連*/
    static openSubWindow(initializedata){//一応ラッパー
        OrderSubWindowOpen(initializedata);
    }
    // データの送受信の窓口を作る
    // ユーザーイベントはここからサブウィンドウにデータを送信し、サブウィンドウからのデータはいったんキャンバスが受け取ってから対象へと渡す
    // メインウィンドウ⇒サブウィンドウへの通信のトリガーはOPモードがONのときの選択範囲変化時
    static PassChangesToSubWindow(data){
        //現時点ではOP層による選択範囲変更をサブウィンドウに通知する
        window.MainWindowRendererMainProcessAPI.FromMainToMainProcess(data);
    }
    // サブウィンドウからメインウィンドウへの通信は入力欄で範囲選択が変わったときや、ヒストグラムで諧調をしたとき、ROIを選択したときなど
    static ReceiveChangesFromSubWindow(data){
        //dataの形式
        //header:action(Windowing, MaskModifyなどを含む)
        //body:action(changeRectangleなど)
        //get(body_actioin)で取得できるように関数を管理する
        //console.log(data);
        const bodyaction=data.get("action");
        const CanvasID=data.get("data").get("CanvasID");
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        const Function=CanvasInstance.FromMainProcessToMainFunctions.get(bodyaction);
        //console.log(Function);
        Function(data);
    }
    static dispose(CanvasID){
        //必要ならサブウィンドウにも通知を送らなければならない
        //現時点であるレイヤーの参照数をデクリメントし、削除を試みる
        const CanvasInstance=CanvasClassDictionary.get(CanvasID);
        for(const [DataType,LayerData] of CanvasInstance.LayerDataMap.entries()){
            const DataID=LayerData.get("DataID");
            //参照数のデクリメントをする
            const DicomData=DicomDataClassDictionary.get(DataType).get(DataID);
            DicomData.set("RefCount",DicomData.get("RefCount")-1);
            LoadAndLayout.TryDeleteDicomData(DataType,DataID);
        }
        /*イベントの解除を行う*/
        for(const [element,eventMap] of CanvasInstance.ElementsWithEvents){
            for(const [event,callback] of eventMap){
                element.removeEventListener(event,callback);
            }
        }
        /*this.Blockがこのクラスの最上位エレメントなので、これをDOMツリーから除外する*/
        CanvasInstance.Block.remove();
    }
    /*基本的なFlag群*/
    static ZoomPanKeyPressedFlagFunction(CanvasInstance){
        return CanvasInstance.pressedkey.has("ControlLeft")||CanvasInstance.pressedkey.has("ControlRight");
    }
    static AreaSelectKeyPressedFlagFunction(CanvasInstance){
        return CanvasInstance.pressedkey.has("KeyD");
    }
    /*
    static MouseEnterInCanvasAreaFlagFunction(CanvasInstance){
        return CanvasInstance.mouseenter;
    }
    */
    static LocalSliceAndAlignFlagFunction(CanvasInstance){
        const MouseEnterInCanvasAreaFlag=CanvasInstance.mouseenter;
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        const AreaSelectKeyPressedFlag=CanvasInstance.FlagMap.get("AreaSelectKeyPressed").get("Flag");
        return MouseEnterInCanvasAreaFlag&&!ZoomPanKeyPressedFlag&&!AreaSelectKeyPressedFlag;
    }
    static ZoomFlagFunction(CanvasInstance){
        const MouseEnterInCanvasAreaFlag=CanvasInstance.mouseenter;
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        return MouseEnterInCanvasAreaFlag&&ZoomPanKeyPressedFlag;
    }
    static PanFlagFunction(CanvasInstance){
        const ZoomFlag=CanvasInstance.FlagMap.get("Zoom").get("Flag");
        return ZoomFlag&&CanvasInstance.mouseClicked.has(0);
    }
    static AreaSelectPanFlagFunction(CanvasInstance){
        const MultiUseLayerModeFlag=CanvasInstance.MultiUseLayerModeFlagSet.has("AreaSelect");
        const MouseEnterInCanvasAreaFlag=CanvasInstance.mouseenter;
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        const AreaSelectKeyPressedFlag=CanvasInstance.FlagMap.get("AreaSelectKeyPressed").get("Flag");
        return MultiUseLayerModeFlag&&MouseEnterInCanvasAreaFlag&&!ZoomPanKeyPressedFlag&&!AreaSelectKeyPressedFlag;
    }
    static AreaSelectSliceCropFlagFunction(CanvasInstance){
        const AreaSelectPanFlag=CanvasInstance.FlagMap.get("AreaSelectPan").get("Flag");
        return AreaSelectPanFlag;
    }
    static AreaSelectDrawRectangleFlagFunction(CanvasInstance){
        const MultiUseLayerModeFlag=CanvasInstance.MultiUseLayerModeFlagSet.has("AreaSelect");
        const MouseEnterInCanvasAreaFlag=CanvasInstance.mouseenter;
        const ZoomPanKeyPressedFlag=CanvasInstance.FlagMap.get("ZoomPanKeyPressed").get("Flag");
        const AreaSelectKeyPressedFlag=CanvasInstance.FlagMap.get("AreaSelectKeyPressed").get("Flag");
        return MultiUseLayerModeFlag&&MouseEnterInCanvasAreaFlag&&!ZoomPanKeyPressedFlag&&AreaSelectKeyPressedFlag;
    }
    static AreaSelectZoomFlagFunction(CanvasInstance){
        const AreaSelectDrawRectangleFlag=CanvasInstance.FlagMap.get("AreaSelectDrawRectangle").get("Flag");
        return AreaSelectDrawRectangleFlag;
    }
    constructor(CanvasID){
        //一応一時的にデータにアクセスしておく
        this.id=new Map([
            ["CanvasID",CanvasID],
        ]);
        //イベント設定
        //アクションごとにイベントを配列として保持し、一括で消すためのモノ
        this.ElementsWithEvents=new Map();//element:Map(event:[func1,func2...])という風にする
        /*サブウィンドウ関連の機能の登録*/
        this.FromMainProcessToMainFunctions=new Map();
        this.FlagMap=new Map();//{FlagName:{"Flag":,"Func":}}
        //キャンバスをまとめるブロック
        this.Block=document.createElement("div");
        this.Block.className="Block";
        this.CanvasBlock=document.createElement("div");
        this.CanvasBlock.className="CanvasBlock";
        this.CanvasBlock.tabIndex="-1";//JSでのみフォーカス可能
        this.CanvasBlock.setAttribute("data-CanvasID",CanvasID);//Valueを持てない要素なので属性でCanvasIDを持たせる
        //DataLoadMapからの情報を基にレイヤーを生成
        /*
        ここでしなければいけないのはレイヤー生成とコンテキストメニューの設定
        1. レイヤー生成に関して
        対応するデータタイプのレイヤーが存在しない場合はそれを生成後、LayerDataMapに{DataType:{DataID:,Canvas:}}の形式で追加する
        すでにレイヤーが存在し、データを差し替えるのみの場合、DataIDのみ更新する。このとき、参照数の変更を行う必要があるので古いDataIDも取得しておく
        この関数をSetLayerという名前でメソッド化する
        2. コンテキストメニューの設定について
        追加された順にコンテキストメニューボタンを追加すると順番が都度代わってしまうため、コンテキストメニューの更新が必要な時にまとめて作り直すようにする
        なお、コンテキストメニューの更新が必要なタイミングはあたらしいDataTypeが追加されたとき、すなわち新しくレイヤーが作られるときである。
        データの差し替え時は必要ない
        この関数はInitializeContextMenuという名前でメソッド化する
        */
       //このBlockに設定されるCanvasのwidth,heightをCanvas作成と同時に設定する。基本的にCT、MASKの画像サイズに一致させる。sliderと同様にCT>MASKの優先順位で決定する
        /*
        共通の縦横奥行の設定
        基本的には同じサイズを読み込ませることを想定しているが、異なる場合はCT>MASKの優先順位で決定する
        CONTOURはファイルから読み込むときは素直に読み込むが、描画する時か、このタイミングで共通の座標系にリサンプリングすることを想定している
        そのため、Canvasのサイズ決定には関与しない
        この仕様ではBGのCTを好きなタイミングで変更できるようにしているが、その場合最悪３つのサイズの情報が変わることがある。
        データの差し替えはサイズが変わらないことを前提としているが、もし変わる場合はすべてのCanvasのサイズを更新する必要があるためんどくさい。
        データの差し替えはサイズが同じことを前提として実行させる。サイズが変わるような場合はBlock自体を新しく作り直すことを推奨する。　
        */
        this.CanvasWidth=0;
        this.CanvasHeight=0;
        this.SliderLength=0;//スライダーの最大値決定に使用する
        //コンテキストメニューを初期化する。
        this.InitializeContextMenu();
        //LayerはCT＞MASK＞CONTOUR,MASKDIFFの順で作成していく
        //LayerのZindexは奥から順にCT＞MASK、MASKDIFF＞CONTOUR、DOSEとする

        //多用途的なキャンバス
        //ユーザー操作の可視化など、補助的な表示に使う
        this.MultiUseLayer=document.createElementNS(SVGNameSpace,"svg");
        this.MultiUseLayer.classList.add("Canvas");//svgはclassNameが使えないみたい
        this.MultiUseLayer.style.zIndex=-1;
        this.MultiUseLayer.style.display="none";//有効化する時は""で
        /*MultiUseLayerに関する機能*/
        this.MultiUseLayerModeFlagSet=new Set();

        //スライダー
        this.slider=document.createElement("input");
        this.slider.type="range";
        this.slider.className="localSlider";
        //コンテキストメニューはCanvasBlockに設定する
        this.Block.appendChild(this.CanvasBlock);
        //this.CanvasBlock.appendChild(MainCanvas);
        this.CanvasBlock.appendChild(this.MultiUseLayer);
        this.Block.appendChild(this.slider);
        //OPCanvasのサイズも同様に決めておく
        //this.MultiUseLayer.width=this.CanvasWidth;
        //this.MultiUseLayer.height=this.CanvasHeight;

        CanvasContainer.appendChild(this.Block);
        //CanvasBlockの要求サイズを決定する
        //this.Width=this.CanvasWidth;//Canvas
        //this.Height=this.CanvasHeight+16;//absoluteのキャンバスを離すにはマージンを付けるしかない

        //this.InitializeContextMenu();
        //this.createBGCanvas();
        this.LayerDataMap=new Map();//{DataType:{DataID:,Layer:}}の形式で保持する
        //SetLayerには{DataType:DataID,...}の形式を渡す
        //SetLayer内ではsetContextMenuを呼び出す.
    }
    InitializeEventFunctions(DataInfoMap){
        //Canvasのインスタンスを一度CanvasClassDictionaryに登録してから
        this.setObserverEvents();
        this.SetPrimitiveFlags();
        this.SetLayer(DataInfoMap);
        this.SetSliderParameter();//スライダーのパラメータを決定する
        this.setUserEvents();
        this.SetContextMenuFunctions();
        //すべての準備が整ったので描画開始
        this.Alldraw();
    }
    SetLayer(DataInfoMap){
        /*
        SetLayerで行うこと
        Canvasの作成
        CanvasのWidthとHeightの設定。this.WIDTH,HEIGHTがnullの場合更新し、それを設定値としてセットする
        SliderLengthも更新する。
        LayerDataMapに情報の追加
        DicomClassDictionaryの参照数の更新(インクリメント)    
        さらに新しいDataTypeの場合はコンテキストメニューの再作成
        */
        //DataInfoMap={DataType:DataID,}
        //console.log(DataInfoMap);
        const CanvasID=this.id.get("CanvasID");
        for(const [DataType,DataID] of DataInfoMap.entries()){
            //console.log("SetLayer",DataType,DataID);
            const DataMap=DicomDataClassDictionary.get(DataType).get(DataID);//{Data:DicomData,RefCount:x}
            const DicomData=DataMap.get("Data");
            const DicomDataWidth=DicomData.width;
            const DicomDataHeight=DicomData.height;
            const DicomDataDepth=DicomData.depth;
            /*未設定の場合に更新される*/
            /*基本的にCT,もしくはMASKのサイズに合わせる*/
            /*ただし、CTとMASKが同時に読み込まれたときはCT優先とする*/
            /*この関数はCTから順番に呼び出される想定である*/
            this.CanvasWidth=this.CanvasWidth||DicomDataWidth;
            this.CanvasHeight=this.CanvasHeight||DicomDataHeight;
            this.SliderLength=this.SliderLength||DicomDataDepth;
            /*
            このキャンバスブロックに関するサイズを更新する
            MultiUseLayerのサイズ
            this.Width
            this.Height
            this.SliderLength
            */
            this.MultiUseLayer.width=this.CanvasWidth;
            this.MultiUseLayer.height=this.CanvasHeight;
            this.Width=this.CanvasWidth;
            this.Height=this.CanvasHeight+16;
            //すでにこのDataTypeのLayerが存在するかのフラグ
            if(this.LayerDataMap.has(DataType)){
                //このDataTypeのレイヤーはすでに存在する
                //データの差し替えを行う
                const OldDataID=this.LayerDataMap.get(DataType).get("DataID");
                //参照数の更新
                //古い参照をデクリメントして、新しい参照をインクリメントする
                const OldDataMap=DicomDataClassDictionary.get(DataType).get(OldDataID);
                OldDataMap.set("RefCount",OldDataMap.get("RefCount")-1);
                DataMap.set("RefCount",DataMap.get("RefCount")+1);
                //DataIDの更新
                this.LayerDataMap.get(DataType).set("DataID",DataID);
                //DicomDataDictionaryからデータを消すグローバル関数に、DataTypeとOldDataIDを渡して消去を試みる
                //ここで消されても他のCanvasBlockで使われている可能性があるため、参照数が0の場合のみ消す
                LoadAndLayout.TryDeleteDicomData(DataType,OldDataID);//関数名は仮決め
            }else{
                //新しいDataTypeの場合はレイヤー生成へ
                const DicomDataTypeClass=DicomData.constructor;
                //const NewLayer=document.createElement("canvas");
                //各データタイプクラスの方で自由にレイヤーを生成
                const NewLayer=DicomDataTypeClass.GetNewLayer();
                //各データタイプに固有の機能等を登録させる
                DicomDataTypeClass.SetUniqueFunctions(CanvasID);
                NewLayer.className="Canvas";
                //NewLayer.style.zIndex=this.LayerZindexMap.get(DataType);
                NewLayer.width=this.CanvasWidth;
                NewLayer.height=this.CanvasHeight;
                this.CanvasBlock.appendChild(NewLayer);
                this.LayerDataMap.set(DataType,new Map([
                    ["DataID",DataID],
                    ["Layer",NewLayer]
                ]));
                //参照数の更新
                DataMap.set("RefCount",DataMap.get("RefCount")+1);
                //新しいレイヤーが追加された＝コンテキストメニューアクティブ化
                //this.ActivateContextMenuButton(DataType);
                //console.log(this.FromMainProcessToMainFunctions);
                this.UpdateContextMenuSize();//新しくボタンが追加されるのでコンテキストメニューのサイズを変更する
            }
            //this.Layerdraw(DataType);
        }
    }
    Alldraw(){
        for(const DataType of this.LayerDataMap.keys()){
            this.Layerdraw(DataType);
        }
        //MultiUseLayerも、Modeに応じて描画する
        //MultiUseLayerへの描画は現在はAreaSelectしかないが、今後増えることも想定してこのように分岐を実装する
        if(this.MultiUseLayerModeFlagSet.has("AreaSelect")){
            this.SelectedAreaDraw();
        }
    }
    Layerdraw(Layer){//targetlayer="CT"とか"MASK"とか
        //指定されたレイヤーのみ再描画
        const LayerData=this.LayerDataMap.get(Layer);
        //const DataType=LayerData.get("DataType");
        const DataType=Layer;
        const DataID=LayerData.get("DataID");
        const Canvas=LayerData.get("Layer");
        const DicomInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);//{Data,RefCount}
        DicomInfoMap.get("Data").draw(Canvas,this.DrawStatus);
    }
    InitializeContextMenu(){
        //コンテキストメニューの初期化
        this.ContextMenuContainer=document.createElement("div");
        this.ContextMenuContainer.className="ContextMenuContainer";
        this.ContextMenuContainer.style.zIndex=10;
        this.ContextMenuTextContainer=document.createElement("div");
        this.ContextMenuTextContainer.className="ContextMenuTextContainer";
        this.ContextMenuTextContainer.textContent=`CanvasID: ${this.id.get("CanvasID")}`;
        this.ContextMenuTextContainer.style.whiteSpace="pre";//改行を有効にする
        this.ContextMenuTextContainer.style.height=`${40}px`;
        this.ContextMenuContainer.append(this.ContextMenuTextContainer);
        this.ContextMenuButtonContainer=document.createElement("div");//挿入位置用に
        this.ContextMenuButtonContainer.className="ContextMenuButtonContainer";
        this.ContextMenuContainer.appendChild(this.ContextMenuButtonContainer);
        this.CanvasBlock.appendChild(this.ContextMenuContainer);
        this.ContextMenuButtonContainer.style.height="30px";
        this.ContextMenuContainer.style.height=this.ContextMenuTextContainer.style.height+this.ContextMenuButtonContainer.style.height;//25*2
        //データの追加ボタン
        //各データタイプのコンテキストメニュー設定(ボタン設置＆イベント定義)
        //this.setCTContext();
        //this.setMASKContext();
        //this.setCONTOURContext();
        
        const DataChangeButton=document.createElement("button");
        DataChangeButton.style.display="block";
        DataChangeButton.textContent="データ追加";
        this.DataChangeButton=DataChangeButton;
        this.ContextMenuButtonContainer.appendChild(DataChangeButton);
        
        //削除ボタンの追加
        const delateButton=document.createElement("button");
        delateButton.style.display="block";
        delateButton.textContent="削 除";
        delateButton.style.color="#FF0000";
        this.delateButton=delateButton;
        //delateli.setAttribute("data-action","delate");//delateボタンには不要かもしれない
        this.ContextMenuButtonContainer.appendChild(delateButton);
        //this.UpdateContextMenuSize();
    }
    SetContextMenuFunctions(){
        //イベント定義
        const CanvasID=this.id.get("CanvasID");
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            if(e.button==2){
                e.preventDefault();
                e.stopPropagation();
                const canvassize=this.CanvasBlock.getBoundingClientRect();
                //サイズを計算するために適当な場所に可視化してしまう。
                this.ContextMenuContainer.style.display="block";
                const contextsize=this.ContextMenuContainer.getBoundingClientRect();
                //メニューを表示する
                const x=e.offsetX;
                const y=e.offsetY;
                const top=(y+contextsize.height<canvassize.height)?y:y-contextsize.height;
                const left=(x+contextsize.width<canvassize.width)?x:x-contextsize.width;
                //console.log("Height",y,contextsize.height,canvassize.height,"=>",top);
                //console.log("Width",x,contextsize.width,canvassize.width,"=>",left);
                this.ContextMenuContainer.style.top=`${top}px`;
                this.ContextMenuContainer.style.left=`${left}px`;
            }else{
                //右クリック以外だったら消すようにしている
                //これによって、コンテキストメニューのボタンの押下時も自動で消えるようになっている
                //ただし、ボタン押下によるイベントは中断されないようだ
                //console.log("CanvasBlockのイベントで消すよ");
                this.ContextMenuContainer.style.display="none";
            }
        });
        Canvas.EventSetHelper(CanvasID,this.DataChangeButton,"click",(e)=>{
            if(e.button===0){
                LoadAndLayoutFunctions.LoadDialogOpen(this.id.get("CanvasID"),"AllDataType");
            }
        });
        Canvas.EventSetHelper(CanvasID,this.delateButton,"click",(e)=>{
            if(e.button===0){
                //console.log("削除発動");
                LoadAndLayoutFunctions.delateCanvas(this.id.get("CanvasID"));
            }
        });
    }
    UpdateContextMenuSize(){
        //可視化状態(display=block)にあるボタンをカウントしてコンテキストメニューの高さを調整する
        const ButtonList=Array.from(this.ContextMenuButtonContainer.children);
        const ButtonNum=ButtonList.length;
        //console.log(VisibleButtonList);
        //console.log("VisibleCount",VisibleCount);
        this.ContextMenuButtonContainer.style.height=`${ButtonNum*30}px`;
        this.ContextMenuContainer.style.height=`${40+ButtonNum*30}px`;
    }
    /*
    ActivateContextMenuButton(DataType){
        //指定されたDataTypeのボタンを可視化する
        const DataTypeContextMenuButtonList=this.ContextMenuButtonContainer.getElementsByClassName(DataType);
        for(const button of DataTypeContextMenuButtonList){
            button.style.display="block";
        }
        this.UpdateContextMenuSize();
    }
    */
    //読み込まれたデータごとのコンテキストメニューの設定関数
    //メインレイヤーのCTorBGCTのCT両方から呼ばれるため、どちらであるかを引数で知らせる
    /*
    setCTContext(){//or BGLayer
        //階調
        const WindowingButton=document.createElement("button");
        WindowingButton.className="CT";//DataTypeをクラス名に持つ要素で絞り込みをして、それを表示するためのクラス名
        WindowingButton.textContent="CT 階調";
        Canvas.EventSetHelper(this.id.get("CanvasID"),WindowingButton,"mouseup",(e)=>{
            if(e.button==0){
                //現在の参照しているCTデータを取得
                const Layer="CT";
                const DataID=this.LayerDataMap.get(Layer).get("DataID");
                const DicomDataInfoMap=DicomDataClassDictionary.get(Layer).get(DataID);
                const DicomDataClass=DicomDataInfoMap.get("Data");
                //const MultiUseLayerModeMap=false;//falseかMapか。MultiLayerModeMap={"Mode":,"Activate":true or false}
                const windowsize=[400,300];
                const AllowAddOrDeleteFlag=false;//このサブウィンドウが開いている間、データの追加・削除を許可するか
                const data=new Map([
                    ["vMin",DicomDataClass.vMin],
                    ["vMax",DicomDataClass.vMax],
                    ["histgram",DicomDataClass.histgram],

                    ["windowsize",windowsize],
                    ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
                    ["Layer",Layer],
                ]);
                const initializedata=new Map([
                    ["action","Windowing"],
                    ["data",data],
                ]);
                this.openSubWindow(initializedata);
            }
        });
        //最後に、このボタンを非表示にする
        WindowingButton.style.display="none";
        this.ContextMenuButtonContainer.appendChild(WindowingButton);
        //サブウィンドウからの更新用の関数を定義する
        const ChangeWindowingFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const targetLayer=ReceivedDataBody.get("Layer");
            const DataType=targetLayer;
            const DataID=this.LayerDataMap.get(targetLayer).get("DataID");
            const DataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
            const DicomDataClass=DataInfoMap.get("Data");
            //CTのvMin, vMaxを変更して再描画する
            //CTクラスに持たせてもいいが、対して大きい処理ではないためここに直接書いた
            DicomDataClass.vMin=ReceivedDataBody.get("vMin");
            DicomDataClass.vMax=ReceivedDataBody.get("vMax");

            this.DrawStatus.set("regenerate",true);
            this.Layerdraw(targetLayer);
        };
        this.FromMainProcessToMainFunctions.set("ChangeWindowing",ChangeWindowingFunction);
    }
    */
    /*
    setMASKContext(){
        //マスク修正
        const MaskModifingButton=document.createElement("button");
        MaskModifingButton.className="MASK";//DataTypeをクラス名に持つ要素で絞り込みをして、それを表示するためのクラス名
        MaskModifingButton.textContent="MASK 修正";
        Canvas.EventSetHelper(this.id.get("CanvasID"),MaskModifingButton,"mouseup",(e)=>{
            if(e.button==0){
                const Layer="MASK";
                const DataID=this.LayerDataMap.get(Layer).get("DataID");
                const DicomDataInfoMap=DicomDataClassDictionary.get("MASK").get(DataID);
                const DicomDataClass=DicomDataInfoMap.get("Data");
                //const MultiUseLayerMode="AreaSelect";//範囲選択モード
                const windowsize=[300,400];
                const AllowAddOrDeleteFlag=false;
                const SelectedArea=new Map([
                    //初期表示用の値を送る
                    ["w0",this.SelectedAreaStatus.get("w0")],
                    ["h0",this.SelectedAreaStatus.get("h0")],
                    ["width",this.SelectedAreaStatus.get("width")],
                    ["height",this.SelectedAreaStatus.get("height")],
                    ["startslice",this.SelectedAreaStatus.get("startslice")],
                    ["endslice",this.SelectedAreaStatus.get("endslice")],
                ]);
                const data=new Map([
                    //ユーザーが選択範囲を手入力で変更する際、範囲境界の判定に使う
                    ["originalimagewidth",this.SelectedAreaStatus.get("originalimagewidth")],
                    ["originalimageheight",this.SelectedAreaStatus.get("originalimageheight")],
                    ["originalslidermax",this.SelectedAreaStatus.get("originalslidermax")],
                    ["SelectedArea",SelectedArea],
                    //修正対象選択用に使う
                    ["histgram",DicomDataClass.histgram],//ヒストグラムのkeys()はイテレータとなっており、これが送れないみたい
                    ["colormap",colormapformask.colormap],//カラーマップの本体だけ送る。クラスインスタンスは構造化オブジェクトじゃないらしいから送れない
                    ["MaskLabel",colormapformask.label],

                    ["windowsize",windowsize],
                    ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
                    //["MultiUseLayerMode",MultiUseLayerMode],
                    ["Layer",Layer],
                ]);
                const initializedata=new Map([
                    ["action","MaskModifing"],
                    ["data",data],
                ]);
                this.openSubWindow(initializedata);
            }
        });
        MaskModifingButton.style.display="none";
        this.ContextMenuButtonContainer.appendChild(MaskModifingButton);
        //サブウィンドウからの更新用の関数を定義する
        const ChangeMaskFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const targetLayer=ReceivedDataBody.get("Layer");
            const DataType=targetLayer;
            const DataID=this.LayerDataMap.get(targetLayer).get("DataID");
            const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
            const DicomDataClass=DicomDataInfoMap.get("Data");
            console.log(data);
            DicomDataClass.ChangeMask(data);
            this.DrawStatus.set("regenerate",true);
            this.Layerdraw(targetLayer);
        }
        this.FromMainProcessToMainFunctions.set("ChangeMask",ChangeMaskFunction);

        const ChangeLabelFunction=(data)=>{
            colormapformask.ChangeLabel(data);
        }
        this.FromMainProcessToMainFunctions.set("ChangeLabel",ChangeLabelFunction);
    }
    */
    /*
    setCONTOURContext(){
        //輪郭の選択画面
        const RoiSelectButton=document.createElement("button");
        RoiSelectButton.className="CONTOUR";
        RoiSelectButton.textContent="ROI選択";
        Canvas.EventSetHelper(this.id.get("CanvasID"),RoiSelectButton,"mouseup",(e)=>{
            if(e.button==0){
                const Layer="CONTOUR";
                const DataID=this.LayerDataMap.get(Layer).get("DataID");
                const DicomDataInfoMap=DicomDataClassDictionary.get(Layer).get(DataID);
                const DicomDataClass=DicomDataInfoMap.get("Data");
                //const MultiUseLayerMode=false;
                //const windowsize=[300,400];//ROINameの最長＆ROIの個数を基に動的に変える必要がある
                const windowsize=[300,400];//とりあえずのサイズ
                const AllowAddOrDeleteFlag=false;
                //console.log(windowsize);
                const data=new Map([
                    ["ROINameColorMap",DicomDataClass.ContourColorMap],//{ROIName:Hex} ROI名と色の表示に必要
                    ["ROISelectStatusSet",DicomDataClass.ROISelectStatusSet],//現時点で何が選ばれているかを示す
                    ["ROIMemoryStatusSet",DicomDataClass.ROIMemoryStatusSet],//現時点で何が記憶されていたかを示す
                    //["ROISelectWindowStyleMap",DicomDataClass.ROISelectWindowStyleMap],//ボタンサイズなどの諸設定
                    
                    ["windowsize",windowsize],
                    ["AllowAddOrDeleteFlag",AllowAddOrDeleteFlag],
                    //["MultiUseLayerMode",MultiUseLayerMode],
                    ["Layer",Layer],
                ]);
                const initialAlldata=new Map([
                    ["action","ROISelect"],
                    ["data",data],
                ]);
                this.openSubWindow(initialAlldata);
            }
        });
        RoiSelectButton.style.display="none";
        this.ContextMenuButtonContainer.appendChild(RoiSelectButton);
        //サブウィンドウからの更新用の関数を定義する
        const ChangeROIStatusSetFunction=(data)=>{
            //ROISelectStatusもROIMemoryStatusSetも全く同じ形式のデータなので、わざわざ関数を分ける必要もないと感じた。
            //しかも、現時点ではMemoryはサブウィンドウ終了時の一回のみなので、なおさら関数を専用に作る必要がないと感じた。
            const ReceivedDataBody=data.get("data");
            const targetLayer=ReceivedDataBody.get("Layer");
            const DataType=targetLayer;
            const DataID=this.LayerDataMap.get(targetLayer).get("DataID");
            const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
            const DicomDataClass=DicomDataInfoMap.get("Data");
            //ROISelectStatusSetか、ROIMemoryStatusSetか
            const Mode=ReceivedDataBody.get("Mode");//"Select" or "Memory"
            //console.log(ReceivedDataBody.get("data").get("ROISelectStatusSet"));
            DicomDataClass.ChangeROIStatusSet(data);
            if(Mode==="Select"){
                //SelectStatusの変更だったら再描画必要
                this.DrawStatus.set("regenerate",true);
                this.Layerdraw(targetLayer);
            }
        }
        this.FromMainProcessToMainFunctions.set("ChangeROIStatusSet",ChangeROIStatusSetFunction);
    }
    */
    SetSliderParameter(){
        //MainlayerとBGの有無から、スライダーを設定する
        this.slider.min=0;
        this.slider.max=this.SliderLength-1;
        this.slider.value=0;
        this.slider.step=1;
        this.slider.style.zIndex=1;
    }
    /*
    ここまで、MultiUseLayerModeの切り替え用関数群
    */
    SetPrimitiveFlags(){
        this.FlagMap.set("ZoomPanKeyPressed",new Map([["Flag",false],["Func",Canvas.ZoomPanKeyPressedFlagFunction]]));
        this.FlagMap.set("AreaSelectKeyPressed",new Map([["Flag",false],["Func",Canvas.AreaSelectKeyPressedFlagFunction]]));
        this.FlagMap.set("LocalSliceAndAlign",new Map([["Flag",false],["Func",Canvas.LocalSliceAndAlignFlagFunction]]));
        this.FlagMap.set("Zoom",new Map([["Flag",false],["Func",Canvas.ZoomFlagFunction]]));
        this.FlagMap.set("Pan",new Map([["Flag",false],["Func",Canvas.PanFlagFunction]]));
        this.FlagMap.set("AreaSelectPan",new Map([["Flag",false],["Func",Canvas.AreaSelectPanFlagFunction]]));
        this.FlagMap.set("AreaSelectSliceCrop",new Map([["Flag",false],["Func",Canvas.AreaSelectSliceCropFlagFunction]]));
        this.FlagMap.set("AreaSelectDrawRectangle",new Map([["Flag",false],["Func",Canvas.AreaSelectDrawRectangleFlagFunction]]));
        this.FlagMap.set("AreaSelectZoom",new Map([["Flag",false],["Func",Canvas.AreaSelectZoomFlagFunction]]));
    }
    FlagUpdater(){
        for(const FlagFunctionMap of this.FlagMap.values()){
            const Func=FlagFunctionMap.get("Func");
            const NewStatus=Func(this);//キャンバスインスタンスを渡す
            FlagFunctionMap.set("Flag",NewStatus);
        }
    }
    /*
    FlagManager(){
        //const MouseWheelSwitchingKeyArray=["ControlLeft","ControlRight","KeyD"];//マウスホイールやドラッグ＆ドロップの切り替えのトリガーとなるキーのリスト
        //LocalSliceAndAlign
        //PositionStanp
        //画像内にマウスあり、かつコントロール押されていない、かつDボタンが押されていない
        //マウスホイールがＺoomPanやエリアセレクト時の拡縮と競合する。
        const ZoomPanKeyPressed=(this.pressedkey.get("ControlLeft")||this.pressedkey.get("ControlRight"));
        const AreaSelectKeyPressed=this.pressedkey.get("KeyD");

        if(this.mouseenter&&!ZoomPanKeyPressed&&!AreaSelectKeyPressed){
            this.LocalSliceAndAlignFlag=true;
        }else{
            this.LocalSliceAndAlignFlag=false;
        }
        if(this.mouseenter&&ZoomPanKeyPressed){
            this.ZoomFlag=true;
            if(this.mouseClicked.get(0)){
                this.PanFlag=true;
            }else{
                this.PanFlag=false;
            }
        }else{
            this.ZoomFlag=false;
            this.PanFlag=false;
        }
        
        //MultiUseLayerMode関連イベント判定
        //常にON状態にある画像のズームパンとの兼ね合いだけ考慮して設定すればOK
        
        //AreaSelect
        //D押下時にON状態にすることで、ZoomPanとの併用を可能にする
        //D押してないときのドラッグ&ドロップ⇒範囲選択
        //ズームパンとは異なり、ここでマウスが押されているかは条件としない
        //マウスが押されたポイントを始点とする必要があるため、本体の中で定義する
        if(this.MultiUseLayerModeFlagSet.has("AreaSelect")&&this.mouseenter&&!ZoomPanKeyPressed&&!AreaSelectKeyPressed){
            this.AreaSelectSliceCropFlag=true;
            this.AreaSelectPanFlag=true;
        }else{
            this.AreaSelectSliceCropFlag=false;
            this.AreaSelectPanFlag=false;
        }
        //Ctrl押しているときのドラッグ&ドロップ⇒選択範囲長方形のパン
        //Ctrl押しているときのホイール⇒選択範囲の拡縮
        //ドラッグ操作があるが、どちらの機能もマウスアップ時に整数に調整させるため、ここではマウス押下を条件に加えない
        if(this.MultiUseLayerModeFlagSet.has("AreaSelect")&&this.mouseenter&&!ZoomPanKeyPressed&&AreaSelectKeyPressed){
            this.AreaSelectDrawRectangleFlag=true;
            this.AreaSelectZoomFlag=true;
        }else{
            this.AreaSelectDrawRectangleFlag=false;
            this.AreaSelectZoomFlag=false;
        }
        //CONTOURROIClick
        //ZoomPanと競合しないようにしたい
        //Ctrl押していないときのクリックでROI内にあるか判定して送信する
        if(this.MultiUseLayerModeFlagSet.has("CONTOURROIClick")&&this.mouseenter&&!ZoomPanKeyPressed){
            this.CONTOURROIClickFlag=true;
        }else{
            this.CONTOURROIClickFlag=false;
        }
        //MASKClick
        //ZoomPanと競合しないようにしたい
        //Ctrl押していないときのクリックでマスクValueを送信する
        if(this.MultiUseLayerModeFlagSet.has("MASKClick")&&this.mouseenter&&!ZoomPanKeyPressed){
            this.MASKClickFlag=true;
        }else{
            this.MASKClickFlag=false;
        }
    }
    */
    setObserverEvents(){
        /*イベント関連のフラグ*/
        //マウスホイール、キーダウンを監視
        this.mouseenter=false;
        this.pressedkey=new Set();//押されたキーにTrueを入れる、押されなくなったらdelateする
        this.mouseClicked=new Set();
        this.MouseTrack=new Map([
            ["previous",new Map()],
            ["current",new Map()]
        ]);
        const CanvasID=this.id.get("CanvasID");
        /*イベントマネージャーユーザーの監視*/
        /*Canvasとラップdivの大きさは常に同じにする。そして、画像のズームパン、ローカルスライスやアラインはdivに紐づける*/
        //マウスの位置はcanvas内=CanvasBlockに入っているかで考える
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseenter",(e)=>{
            this.mouseenter=true;
            //CanvasBlockにフォーカスさせる
            e.target.focus();
            //console.log("mouseenter",this.mouseenter);
            this.FlagUpdater();
        });

        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseleave",(e)=>{
            //CanvasBlockからフォーカスを外す
            this.mouseenter=false;
            //その他の監視変数も初期状態に戻す
            this.pressedkey.clear();
            this.mouseClicked.clear();
            this.MouseTrack.get("previous").clear();
            this.MouseTrack.get("current").clear();
            //フォーカスを外す
            e.target.blur();
            //キャンバスブロックの外に出たらコンテキストメニューもOFFにする
            this.ContextMenuContainer.style.display="none";
            //console.log("mouseenter",this.mouseenter);
            this.FlagUpdater();
        });
        //キーボードが押されているかを監視
        //キーボードが押されっぱなしのときは一定間隔で連続発火する。
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keydown",(e)=>{
            this.pressedkey.add(e.code);
            //console.log(this.pressedkey);
            this.FlagUpdater();
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keyup",(e)=>{
            this.pressedkey.delete(e.code);
            //console.log(this.pressedkey);
            this.FlagUpdater();
        });
        //マウスの動き監視
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousedown",(e)=>{
            this.mouseClicked.add(e.button);
            //console.log(this.mouseClicked);
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            this.mouseClicked.delete(e.button);
            //console.log(this.mouseClicked);
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousemove",(e)=>{
            //座標を更新
            const oldpoints=this.MouseTrack.get("previous");
            const newpoints=this.MouseTrack.get("current");
            oldpoints.set("x",newpoints.get("x"));
            oldpoints.set("y",newpoints.get("y"));
            newpoints.set("x",e.offsetX);
            newpoints.set("y",e.offsetY);
            //console.log("Mouse",this.MouseTrack);
        });
    }
    setUserEvents(){
        //描画領域の状態
        this.DrawStatus=new Map([
            ["regenerate",true],//新しくBitmapを作る
            ["index",0],
            ["w0",0],
            ["h0",0],
            ["originalimagewidth",this.CanvasWidth],
            ["originalimageheight",this.CanvasHeight],
            ["originalslidermax",parseInt(this.slider.max)],
            ["width",this.CanvasWidth],
            ["height",this.CanvasHeight],
            ["scale",1.0],//オリジナルの長さをscaleで割ったモノが描画範囲になる
        ]);
        //console.log(this.DrawStatus);
        this.SelectedAreaStatus=new Map([
            /*AreaSelect*/
            ["drawed",true],
            ["w0",0],
            ["h0",0],
            ["originalimagewidth",this.MultiUseLayer.width],//もともとの幅
            ["originalimageheight",this.MultiUseLayer.height],//もともとの高さ
            ["originalslidermax",parseInt(this.slider.max)],//もともとのスライダーの最大値
            ["width",0],
            ["height",0],
            //SelectedArea選択中のマウスが押され始めた位置を保持する
            ["sw",null],
            ["sh",null],
            /*SliceCrop*/
            ["slicecropdrawed",true],
            ["startslice",0],
            ["endslice",0],
            //SliceCrop時に、Spaceが押され始めた位置を保持する。
            ["startslicetemp",null],
        ]);
        //console.log(this.SelectedAreaStatus);
        this.setLocalSliceAndAlign();
        //this.setPositionStamp();
        this.setZoomPan();
        /*
        イベント発火自体はthis.CanvasBlockに設定すること
        イベント設置要素を一つにまとめた
        各データタイプに強く関連した機能はそのデータタイプのコンテキストメニュー設定時にSetする
        やっぱり、ここで定義する。コンテキストメニューもデータタイプ読み込まれてなくても設定だけしているし、ここでまとめたほうがみやすい
        */
        /*
        AreaSelectモードの諸設定
        */
        //MultiUseLayerにエリアセレクトコンポーネントのグループを追加する
        // グループ内に必要な要素
        // 切り抜いて色を塗るためのマスク
        // 実際に色を塗られるレクト
        const AreaSelectGroup=document.createElementNS(SVGNameSpace,"g");
        const AreaSelectMaskDef=document.createElementNS(SVGNameSpace,"defs");
        const AreaSelectMask=document.createElementNS(SVGNameSpace,"mask");
        const AreaSelectMaskID=`AreaSelectMask_${this.id.get("CanvasID")}`;
        AreaSelectMask.setAttribute("id",AreaSelectMaskID);
        this.AreaSelectMaskURL=`url(#${AreaSelectMaskID})`;//都度指定する
        const OuterRect=document.createElementNS(SVGNameSpace,"rect");
        OuterRect.setAttribute("x",0);
        OuterRect.setAttribute("y",0);
        OuterRect.setAttribute("width",this.CanvasWidth);
        OuterRect.setAttribute("height",this.CanvasHeight);
        OuterRect.setAttribute("fill","white");
        AreaSelectMask.appendChild(OuterRect);

        const InnerRect=document.createElementNS(SVGNameSpace,"rect");//ここが可変である。
        InnerRect.setAttribute("x",0);
        InnerRect.setAttribute("y",0);
        InnerRect.setAttribute("width",this.CanvasWidth);
        InnerRect.setAttribute("height",this.CanvasHeight);
        InnerRect.setAttributeI("fill","black");
        this.SelectedAreaRect=InnerRect;//SelectedAreaRectでアクセスし、マスクの形状を変える
        AreaSelectMask.appendChild(this.SelectedAreaRect);
        AreaSelectMaskDef.appendChild(AreaSelectMask);

        const FillRect=document.createElementNS(SVGNameSpace,"rect");//Outerとこれはサイズが不変である
        FillRect.setAttribute("x",0);
        FillRect.setAttribute("y",0);
        FillRect.setAttribute("width",this.CanvasWidth);
        FillRect.setAttribute("height",this.CanvasHeight);
        FillRect.setAttribute("fill","rgba(255, 255, 255, 0.3)");
        this.FillRect=FillRect;//塗りなおしのときに参照する

        AreaSelectGroup.appendChild(AreaSelectMaskDef);
        AreaSelectGroup.appendChild(this.FillRect);
        this.AreaSelectGroup=AreaSelectGroup;
        this.MultiUseLayer.appendChild(this.AreaSelectGroup);
        
        //AreaSelectモードアクティベーター
        const AreaSelectModeSwitchingFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const Activate=ReceivedDataBody.get("Activate");//True or False
            const ModeFlagName="AreaSelect"
            if(Activate){
                this.MultiUseLayer.style.display="";
                this.MultiUseLayerModeFlagSet.add(ModeFlagName);
                //ZoomPan状態のリセット
                this.DrawStatus.set("w0",0);
                this.DrawStatus.set("h0",0);
                this.DrawStatus.set("width",this.DrawStatus.get("originalimagewidth"));
                this.DrawStatus.set("height",this.DrawStatus.get("originalimageheight"));
                this.DrawStatus.set("scale",1.0);
                this.Alldraw();
            }else{
                //console.log("OPレイヤー終了");
                this.MultiUseLayer.style.display="none";
                this.MultiUseLayerModeFlagSet.delete(ModeFlagName);
            }
            //描画状態とActivateは連動する
            this.SelectedAreaStatus.set("drawed",Activate);
            this.SelectedAreaDraw();
            this.SelectedAreaStatus.set("slicecropdrawed",Activate);
            this.CroppedSliceFill();
            //this.CroppedSliceFill();
            this.FlagUpdater();
        }
        this.FromMainProcessToMainFunctions.set("AreaSelectModeSwitching",AreaSelectModeSwitchingFunction);
        //下４つはサブウィンドウに送信する関数
        this.setAreaSelectDrawRectangle();
        this.setAreaSelectSliceCrop();
        this.setAreaSelectZoom();
        this.setAreaSelectPan();
        //サブウィンドウから受信する関数
        const ChangeSelectedAreaFunction=(data)=>{
            //SelectedAreaStatusを更新して再描画
            //w0,h0,width,heightがまとまっているものを受け取る
            //これは必ずOPレイヤーに対して呼ばれるのでdataからターゲットを抽出する必要はない。
            //OPレイヤーはDICOMレイヤーとは描画ルールが違うためLayerdrawを適用できず、ターゲットを抽出する意味がない
            //SelectedAreaでctxを使って描画する処理も包含しているため、ここではSelectedAreaStatusの更新だけを行う
            //ここで要求するMAPのキーはStatusの該当箇所と一致させる←for文で回すだけで良くなるから

            //サブウィンドウ側の入力確定時に整数への変換を済ませておく
            //よって、サブウィンドウからの入力反映時は値のチェックや整数への変換は必要なし
            const ReceivedDataBody=data.get("data");
            const SelectedAreaData=ReceivedDataBody.get("SelectedArea");//Map型
            //w0,h0,width,heightが格納されているはず
            for(const [key,value] of SelectedAreaData.entries()){
                this.SelectedAreaStatus.set(key,value);
            }
            //反映
            this.SelectedAreaStatus.set("drawed",true);
            this.SelectedAreaDraw();
            this.CroppedSliceFill();
        };
        this.FromMainProcessToMainFunctions.set("ChangeSelectedArea",ChangeSelectedAreaFunction);
    }
    setLocalSliceAndAlign(){
        const CanvasID=this.id.get("CanvasID");
        //this.LocalSliceAndAlignFlag=false;
        this.LocalSliceAndAlignKeydownEventFlag=true;//keydownするとfalseに、keyupするとtrueになる。falseのときは長押し状態=GlobalSliceモード
        Canvas.EventSetHelper(CanvasID,this.slider,"input",(e)=>{
            this.DrawStatus.set("index",parseInt(e.target.value));
            this.DrawStatus.set("regenerate",true);
            this.Alldraw();
        });
        //マウスホイールによるスライス切り替えモード：ズームと衝突しないためにctrlが押されていないときとする
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"wheel",(e)=>{
            e.preventDefault();//ウィンドウのスクロールを抑止
            e.stopPropagation();//キャンバスの裏にある親divのスクロールを阻止
            //ローカルスライス
            if(this.FlagMap.get("LocalSliceAndAlign").get("Flag")){
                let changevalue=Math.sign(e.deltaY);//deltaYが正なら1、負なら-1をかえす。ちなみに下に回すと正となる
                const curretnvalue=parseInt(this.slider.value);
                const sliderlength=this.DrawStatus.get("originalslidermax")+1;//最小値0は固定、線形性を持たせるためにも0～に移している
                const newslidervalue=(curretnvalue+sliderlength+changevalue)%sliderlength;
                if(this.LocalSliceAndAlignKeydownEventFlag){//Spaceのkeydownイベントが発火していい状態か？=Spaceは現在押されていない状態か？
                    //GlobalSliceモード(完全同期)
                    //画像領域外のGlobalSliceは同じ分スライスをずらすだけ
                    //こちらはスライスの位置も完全にそろえてずらす
                    this.slider.value=newslidervalue;
                    //const rect=this.slider.getBoundingClientRect();
                    //console.log("slider",rect.width,rect.height);
                    //スライダーのイベント発火
                    this.slider.dispatchEvent(new Event("input"));   
                }else{
                    for(const canvas of CanvasClassDictionary.values()){
                        const sliderlength=parseInt(canvas.slider.max)+1;
                        const slider=canvas.slider;
                        slider.value=newslidervalue%sliderlength;
                        slider.dispatchEvent(new Event("input"));
                    }
                }
            }
        });
        //スライスの位置合わせ　or ズームパンの同期処理の重さを和らげるため、Space押下時に他の画像と同期することにする
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keydown",(e)=>{
            if(this.FlagMap.get("LocalSliceAndAlign").get("Flag")&&this.LocalSliceAndAlignKeydownEventFlag&&e.code==="Space"){//長押し状態の連続発火を抑制
                //Flagの更新
                this.LocalSliceAndAlignKeydownEventFlag=false;
                //他のキャンバスの位置を自分に合わせる
                const newslidervalue=parseInt(this.slider.value);
                /*上のglobalsliceと同じ処理*/
                //console.log("再描画させるよ");
                for(const canvas of CanvasClassDictionary.values()){
                    const sliderlength=parseInt(canvas.slider.max)+1;
                    const slider=canvas.slider;
                    slider.value=newslidervalue%sliderlength;
                    canvas.slider.dispatchEvent(new Event("input"));//スライダー自体の移動もあるため、手作業と同じ経路の作業としている。
                }
            }
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keyup",(e)=>{
            if(this.FlagMap.get("LocalSliceAndAlign").get("Flag")&&e.code==="Space"){
                //Flagの更新
                this.LocalSliceAndAlignKeydownEventFlag=true;
            }
        });
    }
    setZoomPan(){
        const CanvasID=this.id.get("CanvasID");
        //this.ZoomFlag=false;
        //this.PanFlag=false;
        /*ZoomPanのイベントを定義する*/
        //Zoom
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"wheel",(e)=>{
            e.preventDefault();//ウィンドウのスクロールを抑止
            e.stopPropagation();//キャンバスの裏にある親divのスクロールを阻止
            //拡大縮小
            if(this.FlagMap.get("Zoom").get("Flag")){
                //新しいscaleを計算する。1.0を下回らないようにする
                const oldscale=this.DrawStatus.get("scale");
                const newscale=Math.min(Math.max(oldscale-(Math.sign(e.deltaY))/10,1.0),6.0);
                if(oldscale!==newscale){
                    const rect=this.CanvasBlock.getBoundingClientRect();
                    //ウィンドウサイズに関わらず端からどれくらいのところでにマウスがあるかになる
                    //const ratioX=e.offsetX/rect.width;
                    //const ratioY=e.offsetY/rect.height;
                    //割合をもとに画像座標系のどこをマウスがさしているか計算する
                    const currentpoints=this.MouseTrack.get("current");
                    const centerX=this.DrawStatus.get("w0")+((this.DrawStatus.get("width")*currentpoints.get("x"))/rect.width);
                    const centerY=this.DrawStatus.get("h0")+((this.DrawStatus.get("height")*currentpoints.get("y"))/rect.height);
                    const originalimagewidth=this.DrawStatus.get("originalimagewidth");
                    const originalimageheight=this.DrawStatus.get("originalimageheight");
                    const newwidth=originalimagewidth/newscale;
                    const newheight=originalimageheight/newscale;
                    let neww0=(centerX*newscale-(centerX-this.DrawStatus.get("w0"))*oldscale)/newscale;
                    neww0=Math.max(0,Math.min(neww0,originalimagewidth-newwidth));
                    let newh0=(centerY*newscale-(centerY-this.DrawStatus.get("h0"))*oldscale)/newscale;
                    newh0=Math.max(0,Math.min(newh0,originalimageheight-newheight));
                    //DrawStatusを更新
                    this.DrawStatus.set("w0",neww0);
                    this.DrawStatus.set("h0",newh0);
                    this.DrawStatus.set("width",newwidth);
                    this.DrawStatus.set("height",newheight);
                    this.DrawStatus.set("scale",newscale);
                    this.Alldraw();
                }
            }
        });
        //クリックイベントコンテキストメニューはそれ専用のイベントもあるようなので分けた方が見やすいかも
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousedown",(e)=>{
            if(this.FlagMap.get("Zoom").get("Flag")){
                if(e.button==1){//中央ボタンクリックでズームパンをリセット
                    this.DrawStatus.set("w0",0);
                    this.DrawStatus.set("h0",0);
                    this.DrawStatus.set("width",this.DrawStatus.get("originalimagewidth"));
                    this.DrawStatus.set("height",this.DrawStatus.get("originalimageheight"));
                    this.DrawStatus.set("scale",1.0);
                    this.Alldraw();
                }
            }
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousemove",(e)=>{
            if(this.FlagMap.get("Pan").get("Flag")){
                //拡大されてないとパンは実質無効
                const oldX=this.MouseTrack.get("previous").get("x"),oldY=this.MouseTrack.get("previous").get("y");
                const newX=this.MouseTrack.get("current").get("x"),newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                const currentwidth=this.DrawStatus.get("width");
                const currentheight=this.DrawStatus.get("height");
                //移動量を計算
                const moveX=currentwidth*(newX-oldX)/rect.width;
                const moveY=currentheight*(newY-oldY)/rect.height;
                const neww0=Math.max(0,Math.min(this.DrawStatus.get("w0")-moveX,this.DrawStatus.get("originalimagewidth")-currentwidth));
                const newh0=Math.max(0,Math.min(this.DrawStatus.get("h0")-moveY,this.DrawStatus.get("originalimageheight")-currentheight));
                //描画情報を更新
                this.DrawStatus.set("w0",neww0);
                this.DrawStatus.set("h0",newh0);
                //再描画
                this.Alldraw();
            }
        });
        //描画領域を合わせる
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keydown",(e)=>{
            if(this.FlagMap.get("Zoom").get("Flag")&&e.code=="Space"){
                //DrawFlagの該当箇所を書き換えてAlldrawを呼び出す
                //並べている画像は同サイズであることを前提としている
                const w0=this.DrawStatus.get("w0");
                const h0=this.DrawStatus.get("h0");
                const width=this.DrawStatus.get("width");
                const height=this.DrawStatus.get("height");
                const scale=this.DrawStatus.get("scale");
                for(const canvas of CanvasClassDictionary.values()){
                    canvas.DrawStatus.set("w0",w0);
                    canvas.DrawStatus.set("h0",h0);
                    canvas.DrawStatus.set("width",width);
                    canvas.DrawStatus.set("height",height);
                    canvas.DrawStatus.set("scale",scale);
                    canvas.Alldraw();
                }
            }
        })
    }
    /*AreaSelectイベント登録*/
    setAreaSelectDrawRectangle(){
        const CanvasID=this.id.get("CanvasID");
        //this.AreaSelectDrawRectangleFlag=false;
        //始点の更新
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousedown",(e)=>{
            //DrawRencangleがONであり、かつ左クリックされた
            /*
            マウスを押したときにdrawをfalseにしておく。
            その後mousemoveが行われるとtrueになるため描画されるが、
            そのままmouseupまで行くとdraw=falseのまま描画処理が呼ばれるようにしている
            そのため、マウスを押すだけ＝選択範囲の描画消去となる
            しかし、前回の選択範囲確定版は消去されていない
            あくまで視覚的な範囲選択を消すだけ←範囲選択状態が邪魔になるときもあり、これに対処した機能
            11/26時点でこのメソッドが起動しているときはZoomPan状態がリセットされているはず
            12/05、ZoomPan状態でも行えるように一般化する
            */
            if(this.FlagMap.get("AreaSelectDrawRectangle").get("Flag")&&this.mouseClicked.has(0)){
                const newX=this.MouseTrack.get("current").get("x");
                const newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                //患者座標系への変換
                const currentw0=this.DrawStatus.get("w0");
                const currenth0=this.DrawStatus.get("h0");
                const currentwidth=this.DrawStatus.get("width");//現在の描画座標系のサイズ
                const currentheight=this.DrawStatus.get("height");
                const neww0=currentwidth*(newX/rect.width)+currentw0;
                const newh0=currentheight*(newY/rect.height)+currenth0;
                //SelectedAreaStatusにセットする
                this.SelectedAreaStatus.set("sw",neww0);
                this.SelectedAreaStatus.set("sh",newh0);
                //この時点での描画はされない
                this.SelectedAreaStatus.set("drawed",false);
            }
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousemove",(e)=>{
            if(this.FlagMap.get("AreaSelectDrawRectangle").get("Flag")&&this.mouseClicked.has(0)){
                //mousedown時に保持した始点からの距離をwidthとheightとする
                const newX=this.MouseTrack.get("current").get("x");
                const newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();

                const currentw0=this.DrawStatus.get("w0");
                const currenth0=this.DrawStatus.get("h0");
                const currentwidth=this.DrawStatus.get("width");
                const currentheight=this.DrawStatus.get("height");
                //画像座標系上の移動に変換
                let movedX=currentwidth*(newX/rect.width)+currentw0;
                let movedY=currentheight*(newY/rect.height)+currenth0;
                const sw=this.SelectedAreaStatus.get("sw");
                const sh=this.SelectedAreaStatus.get("sh");
                //新しいSelectedAreaStatusの値を計算
                const neww0=Math.min(sw,movedX);
                const newh0=Math.min(sh,movedY);
                const newwidth=Math.abs(movedX-sw);
                const newheight=Math.abs(movedY-sh);
                //console.log(neww0,newh0,newwidth,newheight);
                //値を更新
                this.SelectedAreaStatus.set("w0",neww0);
                this.SelectedAreaStatus.set("h0",newh0);
                this.SelectedAreaStatus.set("width",newwidth);
                this.SelectedAreaStatus.set("height",newheight);

                this.SelectedAreaStatus.set("drawed",true);
                this.SelectedAreaDraw();
            }
        });
        /*
        ドラッグ系イベントはmouseupで精査した後の値を送信する
        */
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",()=>{
            if(this.FlagMap.get("AreaSelectDrawRectangle").get("Flag")){
                //console.log("AreaSelectDrawRectangle","mouseup");
                //ドラッグの始点をリセットする
                this.SelectedAreaStatus.set("sw",null);
                this.SelectedAreaStatus.set("sh",null);
                
                //現在のSelectedAreaを精査して値を変更する
                let sw=this.SelectedAreaStatus.get("w0");
                let sh=this.SelectedAreaStatus.get("h0");
                let gw=sw+this.SelectedAreaStatus.get("width");
                let gh=sh+this.SelectedAreaStatus.get("height");
                //sw,shは自分以上の最小の整数にする
                sw=Math.ceil(sw);
                sh=Math.ceil(sh);
                //gw,ghは自分以下の最大の整数にする
                gw=Math.floor(gw);
                gh=Math.floor(gh);
                //最終的な値に更新して再描画
                this.SelectedAreaStatus.set("w0",sw);
                this.SelectedAreaStatus.set("h0",sh);
                this.SelectedAreaStatus.set("width",gw-sw);
                this.SelectedAreaStatus.set("height",gh-sh);
                this.SelectedAreaDraw();
                //確定した値を送信する
                //headerはなしでもよし
                //bodyにはw0,h0,width,heightを入れたものをおくる
                //こちら側から送るときもaction=ChangeSelectedArea
                this.SendSelectedArea();//ラッパー
            }
        });
    }
    setAreaSelectSliceCrop(){
        //this.AreaSelectSliceCropFlag=false;
        const CanvasID=this.id.get("CanvasID");
        /*
        keydownイベントは長押しにも対応するために、押している間連続で発火し続けてしまう
        そのため、keydown,keyupを1回ずつで対応させるためにフラグを使用する
        このフラグは通常trueだが、keydownでfalseとなり、これがfalseのときkeydownの発火を抑制する
        keyupでtrueに戻る
        CやAなどのボタンで反応させると、スライドショーをするときにローカルスライドショーになってしまい、少し不便
        そこで、spaceに反応させることでグローバルスライスをさせつつクロップの範囲選択を行わせる
        */
        this.AreaSelectSliceCropKeyDownEventFlag=true;
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keydown",(e)=>{
            if(this.FlagMap.get("AreaSelectSliceCrop").get("Flag")){
                if(this.AreaSelectSliceCropKeyDownEventFlag&&e.code==="Space"){//Spaceが押し込まれたとき
                    //押されたときに可視化を解除
                    //1枚選択もあるのでtrueにしておく
                    this.SelectedAreaStatus.set("slicecropdrawed",true);
                    const currentSlice=this.DrawStatus.get("index");
                    //this.SelectedAreaStatus.set("startslice",currentSliceIndex);
                    this.SelectedAreaStatus.set("startslicetemp",currentSlice);
                    //Space押下始点をstartとgoalにセット
                    this.SelectedAreaStatus.set("startslice",currentSlice);
                    this.SelectedAreaStatus.set("endslice",currentSlice);
                    //フラグを変化させる
                    this.AreaSelectSliceCropKeyDownEventFlag=false;
                }
            }
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"wheel",(e)=>{
            if(this.FlagMap.get("AreaSelectSliceCrop").get("Flag")){
                if(!this.AreaSelectSliceCropKeyDownEventFlag){//keydownイベント抑制中＝長押し状態
                    //SliceCrop可視化
                    this.SelectedAreaStatus.set("slicecropdrawed",true);
                    const currentSlice=this.DrawStatus.get("index");
                    let startslice=this.SelectedAreaStatus.get("startslicetemp");
                    let endslice=currentSlice;
                    if(startslice>endslice){
                        let tmp=startslice;
                        startslice=endslice;
                        endslice=tmp;
                    }
                    this.SelectedAreaStatus.set("startslice",startslice);
                    this.SelectedAreaStatus.set("endslice",endslice);
                    /*
                    選択範囲変更
                    CroppedSliceFillでスライダーの色を変更
                    SelectedAreaDraw内で選択範囲内に色付ける 
                    */
                    this.CroppedSliceFill();
                    this.SelectedAreaDraw();
                }
            }
        });
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"keyup",(e)=>{
            if(this.FlagMap.get("AreaSelectSliceCrop").get("Flag")){
                if(e.code==="Space"){
                    /*
                    let startslice=this.SelectedAreaStatus.get("startslice");
                    let endslice=this.DrawStatus.get("index");
                    //console.log(endslice);
                    if(startslice>endslice){
                        //大小関係が異なるため交換する
                        let temp=startslice;
                        startslice=endslice;
                        endslice=temp;
                    }
                    this.SelectedAreaStatus.set("startslice",startslice);
                    this.SelectedAreaStatus.set("endslice",endslice);
                    */
                    //フラグを変化させる
                    this.AreaSelectSliceCropKeyDownEventFlag=true;
                    this.CroppedSliceFill();//スライダーの背景色を変更する
                    this.SelectedAreaDraw();
                    this.SendSelectedArea();//ラッパー
                }
            }
        });
        //Sliceチェンジに反応させる
        //Sliceチェンジごとに描画させることになる
        Canvas.EventSetHelper(CanvasID,this.slider,"input",(e)=>{
            this.SelectedAreaDraw(); 
        });
    }
    setAreaSelectZoom(){
        const CanvasID=this.id.get("CanvasID");
        //this.AreaSelectZoomFlag=false;
        //OperatioinZoomの定義
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            /*
            wheelによる拡大縮小時も送信する
            */
            if(this.SelectedAreaStatus.get("drawed")&&this.FlagMap.get("AreaSelectZoom").get("Flag")){
                //上に回すと拡大、下に回すと縮小にする
                const sizechangevalue=(-1)*Math.sign(e.deltaY);//deltaYが正なら1、負なら-1をかえす。ちなみに下に回すと正となる
                const w0=this.SelectedAreaStatus.get("w0");
                const h0=this.SelectedAreaStatus.get("h0");
                const width=this.SelectedAreaStatus.get("width");
                const height=this.SelectedAreaStatus.get("height");
                //現在のZoomPan状態よりも大きくならないようにする
                //以下の4つは小数であることの方が多いので、Math.ceil、Math.floorで適切に整数に丸めること
                const DrawSW=this.DrawStatus.get("w0");
                const DrawSH=this.DrawStatus.get("h0");
                const DrawWidth=this.DrawStatus.get("width");
                const DrawHeight=this.DrawStatus.get("height");
                const DrawGW=DrawSW+DrawWidth;
                const DrawGH=DrawSH+DrawHeight;
                //選択していい範囲
                const IntegerDrawSW=Math.ceil(DrawSW);
                const IntegerDrawSH=Math.ceil(DrawSH);
                const IntegerWidth=Math.floor(DrawGW)-IntegerDrawSW;//現在の描画領域において実際に選択していいサイズ
                const IntegerHeight=Math.floor(DrawGH)-IntegerDrawSH;
                //画面サイズより大きいサイズにならないようにする
                const newwidth=Math.max(0,Math.min(width+2*sizechangevalue,IntegerWidth));
                const newheight=Math.max(0,Math.min(height+2*sizechangevalue,IntegerHeight));
                const w0changevalue=(newwidth-width)/2;
                const h0changevalue=(newheight-height)/2;
                //左上のチェック
                //neww0=w0-w0changevalue
                //DrawW0, DrawH0の値によっては小数点になったりするの
                //Zoomでは内側に整数化する
                const neww0=Math.max(IntegerDrawSW,Math.min(w0-w0changevalue,IntegerDrawSW+IntegerWidth-newwidth));
                const newh0=Math.max(IntegerDrawSH,Math.min(h0-h0changevalue,IntegerDrawSH+IntegerHeight-newheight));
                //console.log(neww0,newh0,newwidth,newheight);
                //値を更新する
                this.SelectedAreaStatus.set("w0",neww0);
                this.SelectedAreaStatus.set("h0",newh0);
                this.SelectedAreaStatus.set("width",newwidth);
                this.SelectedAreaStatus.set("height",newheight);
                //最終的な選択範囲を描画
                //this.SelectedAreaStatus.set("regenerate",true);
                this.SelectedAreaDraw();
                //確定した値を送信する
                this.SendSelectedArea();//ラッパー
            }
        });
    }
    setAreaSelectPan(){
        const CanvasID=this.id.get("CanvasID");
        //ZoomPanではdrawの編集は行わない
        //this.AreaSelectPanFlag=false;
        //OperatioinPanの定義
        //マウスドラッグ系イベントはmouseup時に整数にするようにしよう
        //マウスが押された状態でマウスが動くと起動する
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mousemove",(e)=>{
            if(this.SelectedAreaStatus.get("drawed")&&this.mouseClicked.has(0)&&this.FlagMap.get("AreaSelectPan").get("Flag")){
                //拡大されてないとパンは実質無効
                const oldX=this.MouseTrack.get("previous").get("x"),oldY=this.MouseTrack.get("previous").get("y");
                const newX=this.MouseTrack.get("current").get("x"),newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                //OPモード起動時にZoomPanをリセット＆OPモード中は無効になるのでoriginalのサイズを使って移動分を計算する
                //現在のZoomPan状態よりも大きくならないようにする
                //整数に丸め込む
                const DrawW0=this.DrawStatus.get("w0");
                const DrawH0=this.DrawStatus.get("h0");
                const DrawWidth=this.DrawStatus.get("width");
                const DrawHeight=this.DrawStatus.get("height");
                //移動量を計算
                const moveX=DrawWidth*(newX-oldX)/rect.width;
                const moveY=DrawHeight*(newY-oldY)/rect.height;
                const neww0=Math.max(DrawW0,Math.min(this.SelectedAreaStatus.get("w0")+moveX,DrawW0+DrawWidth-this.SelectedAreaStatus.get("width")));
                const newh0=Math.max(DrawH0,Math.min(this.SelectedAreaStatus.get("h0")+moveY,DrawH0+DrawHeight-this.SelectedAreaStatus.get("height")));
                //描画情報を更新
                this.SelectedAreaStatus.set("w0",neww0);
                this.SelectedAreaStatus.set("h0",newh0);
                //再描画
                //this.SelectedAreaStatus.set("regenerate",true);
                this.SelectedAreaDraw();
            }
        });
        /*
        ドラッグ系イベントはmouseupで精査した後の値を送信する
        */
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            if(this.SelectedAreaStatus.get("drawed")&&this.FlagMap.get("AreaSelectPan").get("Flag")){
                //現在のSelectedAreaを精査して値を変更する
                //console.log("AreaSelectZoomPan","mouseup");
                let sw=this.SelectedAreaStatus.get("w0");
                let sh=this.SelectedAreaStatus.get("h0");
                const SelectedWidth=this.SelectedAreaStatus.get("width");
                const SelectedHeight=this.SelectedAreaStatus.get("height");
                //let gw=sw+this.SelectedAreaStatus.get("width");
                //let gh=sh+this.SelectedAreaStatus.get("height");
                //ZoomPanではwidthとheightは変わってはいけないため、すべて同じ方法で整数に直す
                //sw,shは自分以上の最小の整数にする
                sw=Math.round(sw);//DrawRectではceil
                sh=Math.round(sh);
                const DrawSW=this.DrawStatus.get("w0");
                const DrawSH=this.DrawStatus.get("h0");
                const DrawWidth=this.DrawStatus.get("width");
                const DrawHeight=this.DrawStatus.get("height");
                const IntegerDrawSW=Math.ceil(DrawSW);
                const IntegerDrawSH=Math.ceil(DrawSH);
                const IntegerDrawGW=Math.floor(DrawSW+DrawWidth);
                const IntegerDrawGH=Math.floor(DrawSH+DrawHeight);
                //const IntegerDrawWidth=IntegerDrawGW-IntegerDrawSW;
                //const IntegerDrawHeight=IntegerDrawGH-IntegerDrawSH;
                /*
                console.log("------------------------------------");
                console.log(DrawSW,DrawSW+DrawWidth,DrawWidth,DrawSH,DrawSH+DrawHeight,DrawHeight);
                console.log(IntegerDrawSW,IntegerDrawGW,IntegerDrawWidth,IntegerDrawSH,IntegerDrawGH,IntegerDrawHeight);
                */
                //現在の描画領域で存在できる範囲を確認して最終的な値とする
                //Width,Heightはしっかり条件を満たす整数値になっているという信頼のもと
                sw=Math.max(IntegerDrawSW,Math.min(sw,IntegerDrawGW-SelectedWidth));
                sh=Math.max(IntegerDrawSH,Math.min(sh,IntegerDrawGH-SelectedHeight));
                this.SelectedAreaStatus.set("w0",sw);
                this.SelectedAreaStatus.set("h0",sh);
                this.SelectedAreaDraw();
                //確定した値を送信する
                this.SendSelectedArea();//ラッパー
            }
        });
    }
    CroppedSliceFill(){
        //まずはリセット
        this.slider.style.setProperty("--track-hilight-start",`${0}%`);
        this.slider.style.setProperty("--track-hilight-end",`${0}%`);
        const startslice=this.SelectedAreaStatus.get("startslice");
        const endslice=this.SelectedAreaStatus.get("endslice");
        //選択スライス数が0でもサムに重なっている部分は塗られてしまう
        //それだと選択されているように見えるため枚数0なら表示しない
        //ただし、一枚選択のときもあるのでやっぱり表示する。
        if(this.SelectedAreaStatus.get("slicecropdrawed")){
            const slidermin=this.slider.min;
            const slidermax=this.slider.max;
            const sliderlength=slidermax-slidermin;//左端で0，右端でmaxとなる。注意
            //const sliderstyles=getComputedStyle(this.slider);
            //const RealSliderThumWidth=sliderstyles.getPropertyValue("--slider-height").trim();
            const RealSliderSize=this.slider.getBoundingClientRect();
            const RealSliderTrackWidth1=RealSliderSize.width;
            const RealSliderThumWidth=RealSliderSize.height;
            const RealSliderTrackWidth2=RealSliderTrackWidth1-RealSliderThumWidth;
            //console.log("Thum",RealSliderThumWidth,"Track",RealSliderTrackWidth);
            /*CropedSliceの描画*/
            //const sliderlength=slidermax-slidermin+1;
            const sp=(startslice-slidermin)/sliderlength;
            const ep=(endslice-slidermin)/sliderlength;
            const fillstartposition=(sp*RealSliderTrackWidth2)/RealSliderTrackWidth1*100;
            const fillendposition=(ep*RealSliderTrackWidth2+RealSliderThumWidth)/RealSliderTrackWidth1*100;
            this.slider.style.setProperty("--track-hilight-start",`${fillstartposition}%`);
            this.slider.style.setProperty("--track-hilight-end",`${fillendposition}%`);
        }
    }
    /*
    draw(ctx,DrawStatus){
        const dx=0,dy=0,dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        const index=DrawStatus.get("index");
        ctx.clearRect(0,0,dWidth,dHeight);//初期化
        //座標系の移動・拡縮
        const sx=DrawStatus.get("w0");
        const sy=DrawStatus.get("h0");
        ctx.save();
        ctx.translate(dx,dy);
        ctx.scale(dWidth/DrawStatus.get("width"),dHeight/DrawStatus.get("height"));
        ctx.translate(-sx,-sy);
        //輪郭の描画
        for(const ROIName of this.ROISelectStatusSet){
            const ROIContourDataMap=this.ContourDataMap.get(ROIName);
            if(ROIContourDataMap.has(index)){
                const ContourPath=ROIContourDataMap.get(index);
                const ContourColorHexText=this.ContourColorMap.get(ROIName);
                ctx.strokeStyle=ContourColorHexText+this.LineAlpha;
                ctx.fillStyle=ContourColorHexText+this.FillAlpha;
                ctx.lineWidth=1;
                ctx.stroke(ContourPath);
                ctx.fill(ContourPath,"evenodd");
            }
        }
        ctx.restore();
    }
    */
    SelectedAreaDraw(){
        const ctx=this.MultiUseLayer.getContext("2d");
        const dx=0,dy=0,dWidth=ctx.canvas.width,dHeight=ctx.canvas.height;
        ctx.clearRect(0,0,dWidth,dHeight);//初期化する
        //slider用のデータ
        if(this.SelectedAreaStatus.get("drawed")){//描画しなければならない
            //Originalの描画領域を反映する
            const DrawStatus=this.DrawStatus;
            const sx=DrawStatus.get("w0");
            const sy=DrawStatus.get("h0");
            ctx.save();
            ctx.translate(dx,dy);//基準点に一度戻る
            ctx.scale(dWidth/DrawStatus.get("width"),dHeight/DrawStatus.get("height"));//サイズを変更
            ctx.translate(-sx,-sy);//中心をずらす
            /*Rectangleの描画*/
            ctx.imageSmoothingEnabled=false;
            ctx.imageSmoothingQuality='low'; // 'low' | 'medium' | 'high'
            
            const w0=this.SelectedAreaStatus.get("w0");
            const h0=this.SelectedAreaStatus.get("h0");
            const width=this.SelectedAreaStatus.get("width");
            const height=this.SelectedAreaStatus.get("height");
            const startslice=this.SelectedAreaStatus.get("startslice");
            const endslice=this.SelectedAreaStatus.get("endslice");
            const currentslice=parseInt(this.slider.value);
            /*現在のスライスが選択範囲内なら塗りつぶし*/
            //まずは全部黒めにつぶす→白めにつぶす＝CT画像を背景にしているときに、選択範囲外を黒くしてもCTと同じになってわかりづらいから
            ctx.fillStyle="rgba(255, 255, 255, 0.3)";
            ctx.beginPath();
            ctx.rect(dx,dy,dWidth,dHeight);
            if(startslice<=currentslice&&currentslice<=endslice){
                /*
                ctx.fillStyle="rgba(255, 137, 137, 0.36)";
                ctx.fillRect(w0,h0,width,height);
                */
                ctx.rect(w0,h0,width,height);
            }
            ctx.fill("evenodd");//選択された部分だけしっかり見える
            ctx.strokeStyle="rgba(255,0,0,0.85)";
            ctx.lineWidth=0.5;
            ctx.strokeRect(w0-0.5,h0-0.5,width+1,height+1);
            ctx.restore();
        }
    }
    /*CONTOURROIClickイベント登録*/
    //11/26時点ではCONTOUR専用機能
    //そのうち、クリックした座標を取得する機能を分離するかも
    /*
    setCONTOURROIClick(){
        const CanvasID=this.id.get("CanvasID");
        this.CONTOURROIClickFlag=false;
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            if(this.CONTOURROIClickFlag&&this.LayerDataMap.has("CONTOUR")&&e.button===0){
                //console.log("ROIClicked!!");
                //現在のZoomPan状態を考慮した画像座標を取得する
                const newX=this.MouseTrack.get("current").get("x");
                const newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                const currentw0=this.DrawStatus.get("w0");
                const currenth0=this.DrawStatus.get("h0");
                const currentwidth=this.DrawStatus.get("width");
                const currentheight=this.DrawStatus.get("height");
                const currentIndex=this.DrawStatus.get("index");
                //現在描画領域を考慮した座標を計算
                const ClickedPointX=currentwidth*(newX/rect.width)+currentw0;
                const ClickedPointY=currentheight*(newY/rect.height)+currenth0;
                //CONTOURclassに判定依頼、Setが返ってくる
                const LayerData=this.LayerDataMap.get("CONTOUR");
                const ctx=LayerData.get("Layer").getContext("2d");
                const TargetDataID=LayerData.get("DataID");
                const TargetDicomDataClass=DicomDataClassDictionary.get("CONTOUR").get(TargetDataID).get("Data");
                const ClicedROISet=TargetDicomDataClass.getClickedROISet(ctx,currentIndex,ClickedPointX,ClickedPointY);
                //現時点ではこの機能以外で使わないチャンネルなのでこの中から送信する。ラッパーは現時点では不要2025/11/26
                const data=new Map([
                    ["action","CONTOURROIClicked"],
                    ["data",new Map([
                        ["ClickedROISet",ClicedROISet]
                    ])]
                ]);
                //console.log(ClicedROISet);
                this.PassChangesToSubWindow(data);
            }
        })
    }
    */
    /*
    setMASKClick(){
        const CanvasID=this.id.get("CanvasID");
        //this.MASKClickFlag=false;
        Canvas.EventSetHelper(CanvasID,this.CanvasBlock,"mouseup",(e)=>{
            if(this.MASKClickFlag&&this.LayerDataMap.has("MASK")&&e.button===0){
                //console.log("ROIClicked!!");
                //現在のZoomPan状態を考慮した画像座標を取得する
                const newX=this.MouseTrack.get("current").get("x");
                const newY=this.MouseTrack.get("current").get("y");
                const rect=this.CanvasBlock.getBoundingClientRect();
                const currentw0=this.DrawStatus.get("w0");
                const currenth0=this.DrawStatus.get("h0");
                const currentwidth=this.DrawStatus.get("width");
                const currentheight=this.DrawStatus.get("height");
                const currentIndex=this.DrawStatus.get("index");
                //現在描画領域を考慮した座標を計算
                const ClickedPointX=currentwidth*(newX/rect.width)+currentw0;
                const ClickedPointY=currentheight*(newY/rect.height)+currenth0;
                //Maskclassに判定依頼、その場所のMaskValueが返ってくる
                const LayerData=this.LayerDataMap.get("MASK");
                const TargetDataID=LayerData.get("DataID");
                const TargetDicomDataClass=DicomDataClassDictionary.get("MASK").get(TargetDataID).get("Data");
                const ClickedMaskValue=TargetDicomDataClass.getClickedMASKValue(currentIndex,ClickedPointX,ClickedPointY);
                const data=new Map([
                    ["action","MASKClicked"],
                    ["data",new Map([
                        ["ClickedMASKValue",ClickedMaskValue]
                    ])]
                ]);
                this.PassChangesToSubWindow(data);
            }
        });
    }
    */
    //本当は作る必要ないが、複数で全く同じ処理をするのでここに関数として記録しておく
    //確定した選択範囲を様式に沿って構成し、PassChangesToSubを使って送信する
    SendSelectedArea(){
        const SelectedArea=new Map();
        for(const key of ["w0","h0","width","height","startslice","endslice"]){
            SelectedArea.set(key,this.SelectedAreaStatus.get(key));
        }
        const data=new Map([
            ["action","ChangeSelectedArea"],
            ["data",new Map([
                ["SelectedArea",SelectedArea]
            ])]
        ]);
        Canvas.PassChangesToSubWindow(data);
    }
}
//ファイル選択～ArrayBufferを返すまでの関数←これはどこも共通
//個々の部分はmain.jsの方でまとめてしまってもいいかも
/*LayOutクラス*/
//画面の構成を担当する。ただし、データの読み込みは担当しないめんどくさいから
/*
キャンバスの配置変更を担当する
データ読み込みはグローバルのままにする⇒めんどくさいから
2025/11/03追記
データの読み込み関係もLayoutクラスにまとめることにした
データ読み込み時にレイアウトの情報を参照する必要があること、まとめてデータを読み込む際にLayout関連との連携が必要だと予想したため
*/
class LoadAndLayout{//静的メソッドだけでいい気がする。わざわざコンストラクタを作る必要ないかも
    /*静的メソッドとしてファイルパス読み込み関数を提供する*/
    static async SelectPathes(DialogTitle="Default Title",PathType="openDirectory",MultiTypeLoad=""){
        const LoadingPathList=await window.DicomLoadAPI.selectFiles(DialogTitle,[PathType,MultiTypeLoad]);
        return LoadingPathList;
    }
    static async LoadFiles(loadingPath){
        console.log(loadingPath);
        const items=await window.DicomLoadAPI.loadDicom(loadingPath);
        if(!items || items.length === 0) {
            console.error("No files selected or loaded.");
            return null;
        }
        //itemsのdatasetsをdicomparseする。これはメインjsではできない構造化可能オブジェクトではないから
        const dicomdata=[];//単独ファイルなら長さ1のリストになる
        for(const item of items){
            const name=item["name"];//ファイル名
            const arraybuffer=item["arrayBuffer"];//そのファイルの中身
            const byteArray=new Uint8Array(arraybuffer);
            const dataset=dicomParser.parseDicom(byteArray);//DICOMデータ全般をなんでも解析する
            dicomdata.push({"name":name,"dataset":dataset});
        }
        return dicomdata;
    }
    static TryDeleteDicomData(DataType,DataID){
        const DataTypeMap=DicomDataClassDictionary.get(DataType);
        if(DataTypeMap.get(DataID).get("RefCount")<=0){//Canvasからの参照が0以下ならば
            //console.log("データ削除",DataType,DataID);
            DataTypeMap.delete(DataID);
            //console.log(DicomDataClassDictionary);
        }
    }
    static async CheckAllowAddOrDelete(){
        /*SubWindowが開かれている状態か確認する*/
        //現時点では、サブウィンドウが開かれている状態ではDicomDataの増減に関わる処理はさせないようにしたい
        //ファイルの読み込み、Canvasの
        const CheckResult= await window.MainWindowRendererMainProcessAPI.CheckAllowAddOrDelete();
        //console.log(CheckResult);
        return CheckResult
    }
    static async CheckPossibilityLoadORDelete(){
        const AllowAddOrDeleteFlag=await this.CheckAllowAddOrDelete();
        //console.log(SubWindowOpendResult);
        if(!AllowAddOrDeleteFlag){
            console.log("データの追加・削除を許可しないサブウィンドウが展開中です");
        }
        return AllowAddOrDeleteFlag;
    }
    constructor(){
        //共通の情報をまとめておく
        window.GetDisplaySize().then(({width,height})=>{
            this.DisplayWidth=width;
            this.DisplayHeight=height;
            //console.log(DisplayWidth,DisplayHeight);
        });
        /*
        データロード用のデータクラスマップ
        同時にデータを読み込む際の優先度順にもなっている
        */
        
        this.DataClassMap=new Map([
            [CTclass.DataType,CTclass],
            [MASKclass.DataType,MASKclass],
            //[DOSEclass.DataType,DOSEclass],
            [MASKDIFFclass.DataType,MASKDIFFclass],
            [DOSEclass.DataType,DOSEclass],
            [CONTOURclass.DataType,CONTOURclass],
        ]);
        //Resize用
        //console.log("PixelRatio",window.devicePixelRatio);
        this.gridgap=5;
        this.menuheight=22;
        this.sliderheight=16;
        this.ElementsWithEvents=new Map();//element:Map(event:[func1,func2...])という風にする
        this.setUserEvents();
    }
    ResetLayoutStatus(LayoutGridReset=false){
        /*tureならGrid情報も初期化する*/
        if(LayoutGridReset){
            this.CurrentRowsNum=1;
            this.CurrentColumnsNum=1;
            //inputの表示も変更
            this.RowsInput.value=1;
            this.ColumnsInput.value=1;
        }
        this.GridNumber2CanvasIDArray=Array(this.CurrentRowsNum*this.CurrentColumnsNum).fill(-1);
        this.CanvasID2GridNumberMap=new Map();
    }
    setUserEvents(){
        //共通のダイアログテンプレートを作成
        this.LoadDialog=document.getElementById("LoadDialog");
        this.LoadDialogDOMTreeContainer=document.getElementById("LoadDialogDOMTreeContainer");
        this.LoadDialogCancelButton=document.getElementById("LoadDialogCancelButton");
        this.LoadDialogConfirmButton=document.getElementById("LoadDialogConfirmButton");
        /*ダイアログのイベント設定*/
        this.LoadDialogCancelButton.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //キャンセルが押されたので閉じる
                this.LoadDialogClose();
            }
        });
        this.LoadDialogCancelButton.addEventListener("keydown",(e)=>{
            if(e.code==="Enter"){
                this.LoadDialogClose();
            }
        });
        this.LoadDialogConfirmButton.addEventListener("mouseup",(e)=>{
            if(e.button===0){
                //読み込み開始する
                this.LoadDialogClose();
                this.DialogLoadingStart();
            }
        });
        this.LoadDialogConfirmButton.addEventListener("keydown",(e)=>{
            if(e.code==="Enter"){
                this.LoadDialogClose();
                this.DialogLoadingStart();
            }
        });
        //読み込み用ボタンとイベント
        /*CT*/
        this.CTButton=document.getElementById("CTButton");
        this.EventSetHelper(this.CTButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"CT");//存在しない正のCanvasIDを指定＝新しくCanvasを作ってほしい, 
            }
        });
        /*MASK*/
        this.MaskButton=document.getElementById("MaskButton");
        this.EventSetHelper(this.MaskButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"MASK");
            }
        });
        /*MASKDIFF*/
        this.MaskDiffButton=document.getElementById("MaskDiffButton");
        this.EventSetHelper(this.MaskDiffButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"MASKDIFF");
            }
        });
        /*CONTOUR*/
        this.ContourButton=document.getElementById("ContourButton");
        this.EventSetHelper(this.ContourButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"CONTOUR");
            }
        });
        /*DOSE*/
        this.DoseButton=document.getElementById("DoseButton");
        this.EventSetHelper(this.DoseButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"DOSE");
            }
        });
        this.MultiTypeLoadButton=document.getElementById("MultiTypeLoadButton");
        this.EventSetHelper(this.MultiTypeLoadButton,"mouseup",async (e)=>{
            if(e.button===0){
                this.LoadDialogOpen(99999,"AllDataType");
            }
        })
        /*リセットボタン*/
        this.ResetButton=document.getElementById("ResetButton");
        this.EventSetHelper(this.ResetButton,"mouseup",async ()=>{
            //const result=window.confirm("読み込んだデータがリセットされます。\nよろしいですか？");
            const result=true;
            if(result){
                //Canvasを消す
                await this.ResetCanvas(true);
            }
            //console.log(DicomDataClassDictionary);
            //console.log(CanvasClassDictionary);
        });

        /*ここからレイアウト関連のイベント設定*/
        this.resizeTimeout=null;
        this.previousBodyOrderWidth=null;
        this.previousBodyOrderHeight=null;
        this.ResizableFlag=true;
        this.ResizeCount=0;
        window.addEventListener("resize",()=>{
            console.log("リサイズ発火",new Date().toISOString());
            if(this.ResizableFlag){
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout=setTimeout(async ()=>{
                    console.log("Windowのリサイズを検知！再調整をするよ",new Date().toISOString());
                    const NewBodyRect=document.body.getBoundingClientRect();
                    //console.log(`Resize Event ${this.count}回目`,NewBodyRect.width,NewBodyRect.height);
                    this.ResizeCalculation(NewBodyRect.width,NewBodyRect.height);//PixelRatioによっては内部でmain.jsに要請したサイズと実際のサイズが変わることがある
                    this.ResizeExecution();
                },200);
            }else{
                console.log("フラグが立っていないため処理が却下されました");
            }
        });
        /*
        this.EventSetHelper(this.ColumnsInputContainer,"wheel",(e)=>{
            const changevalue=-1*Math.sign(e.deltaY);
            this.ColumnsInput.value=Math.max(parseInt(this.ColumnsInput.value)+changevalue,1);
        });
        */
        /*ChangeCanvasLayoutダイアログ*/
        this.ChangeCanvasLayoutButton=document.getElementById("ChangeCanvasLayoutButton");
        this.ChangeCanvasLayoutDialog=document.getElementById("ChangeCanvasLayoutDialog");
        this.ChangeCanvasLayoutDialogCloseButton=document.getElementById("ChangeCanvasLayoutDialogCloseButton");
        //GridChange
        this.RowsInput=document.getElementById("RowsInput");
        this.ColumnsInput=document.getElementById("ColumnsInput");
        this.GridChangeConfirmButton=document.getElementById("GridChangeConfirmButton");
        this.CurrentRowsNum=1;
        this.CurrentColumnsNum=1;
        this.ResetLayoutStatus(true);
        this.CanvasMovePositionButtonContainer=document.getElementById("CanvasMovePositionButtonContainer");
        this.CanvasMovePositionButtonContainer.tabIndex="-1";
        this.CanvasMovePositionSelectedCount=0;
        this.EventSetHelper(this.ChangeCanvasLayoutButton,"mouseup",()=>{
            this.UpdateCanvasMovePositionButtonContainer();//現在のCanvasの配置を再現
            //表示開始
            this.ChangeCanvasLayoutDialog.showModal();
        });
        //ChangeCanvasLayoutダイアログCloseイベント
        const ChangeCanvasLayoutCloseFunction=()=>{
            this.ClearCanvasMovePositionButtonSelect();
            /*
            GridChangeInputでは確定ボタン押下時に格子の変更が行われるため、場合によってはInputの書き換えだけ行って確定を押さないときもある。
            この変更が次のダイアログ展開時も残るので、閉じるときにこれを直しておく
            */
            this.RowsInput.value=this.CurrentRowsNum;
            this.ColumnsInput.value=this.CurrentColumnsNum;
            //最後にダイアログを閉じる
            this.ChangeCanvasLayoutDialog.close();
        }
        this.EventSetHelper(this.ChangeCanvasLayoutDialogCloseButton,"mouseup",(e)=>{
            if(e.button===0){
                ChangeCanvasLayoutCloseFunction();
            }
        });
        this.EventSetHelper(this.ChangeCanvasLayoutDialogCloseButton,"keydown",(e)=>{
            if(e.code==="Enter"){
                ChangeCanvasLayoutCloseFunction();
            }
        });
        //ChangeCanvasLayoutダイアログ ChangeCanvasGridイベント
        this.EventSetHelper(this.RowsInput,"focus",()=>{
            this.RowsInput.select();
        });
        this.EventSetHelper(this.ColumnsInput,"focus",()=>{
            this.ColumnsInput.select();
        });
        this.EventSetHelper(this.GridChangeConfirmButton,"mouseup",(e)=>{
            if(e.button===0){
                this.ChangeCanvasGrid();
            }
        });
        this.EventSetHelper(this.GridChangeConfirmButton,"keydown",(e)=>{
            if(e.code==="Enter"){
                this.ChangeCanvasGrid();
            }
        });
        //ChangeCanvasLayoutダイアログ MoveCanvasイベント
        this.EventSetHelper(this.CanvasMovePositionButtonContainer,"mouseup",(e)=>{
            if(e.button===0&&e.target.tagName==="BUTTON"){
                const PositionButton=e.target;
                if(PositionButton.classList.contains("Selected")){
                    //Selectedを外す
                    PositionButton.classList.remove("Selected");
                    this.CanvasMovePositionSelectedCount--;
                }else{
                    PositionButton.classList.add("Selected");
                    this.CanvasMovePositionSelectedCount++;
                }
                if(this.CanvasMovePositionSelectedCount===2){
                    //２個選択されたので即座に入れ替え処理
                    //選択を初期化して、選択されていたButtonのvalueをまとめた配列を吐き出す
                    const SelectedCanvasMovePositionButtonArray=this.ClearCanvasMovePositionButtonSelect(true);
                    const SelectedLPArray=SelectedCanvasMovePositionButtonArray.map((button)=>parseInt(button.value));
                    /*
                    UpdateCanvasPositionInfomationのと同じようなことをここでやっている
                    あちらは格子に順番にCanvasを詰めた場合の情報に書き換える作業
                    こちらは指定されたCanvasを好感した情報に書き換える作業
                    */
                    const LPA=SelectedLPArray[0];
                    const LPB=SelectedLPArray[1];
                    const CanvasIDA=this.GridNumber2CanvasIDArray[LPA];//-1の可能性あり。
                    const CanvasIDB=this.GridNumber2CanvasIDArray[LPB];//-1の可能性あり
                    this.GridNumber2CanvasIDArray[LPA]=CanvasIDB;
                    this.GridNumber2CanvasIDArray[LPB]=CanvasIDA;
                    let StyleUpdateFlag=false;
                    if(CanvasIDB>=0){
                        this.CanvasID2GridNumberMap.set(CanvasIDB,LPA);
                        StyleUpdateFlag=true;
                    }
                    if(CanvasIDA>=0){
                        this.CanvasID2GridNumberMap.set(CanvasIDA,LPB);
                        StyleUpdateFlag=true;
                    }
                    if(StyleUpdateFlag){
                        this.UpdateCanvasPosition();
                        //新しい位置情報を送信する
                        this.SendMainWindowStatus();
                    }
                    /*見た目の更新*/
                    //ボタンに表示している情報など
                    const PositionButtonA=SelectedCanvasMovePositionButtonArray[0];
                    const PositionButtonB=SelectedCanvasMovePositionButtonArray[1];
                    const EmptyStatusBuffer=PositionButtonA.getAttribute("data-EmptyStatus");
                    const TextContentBuffer=PositionButtonA.textContent;
                    PositionButtonA.setAttribute("data-EmptyStatus",PositionButtonB.getAttribute("data-EmptyStatus"));
                    PositionButtonA.textContent=PositionButtonB.textContent;
                    PositionButtonB.setAttribute("data-EmptyStatus",EmptyStatusBuffer);
                    PositionButtonB.textContent=TextContentBuffer;
                }
            }
        });
        /*ChangeAndLoad*/
        this.ChangeAndLoadButton=document.getElementById("ChangeAndLoadButton");
        this.ChangeAndLoadDialog=document.getElementById("ChangeAndLoadDialog");
        this.ChangeAndLoadPathContainer=document.getElementById("ChangeAndLoadPathContainer");
        this.ChangeAndLoadTargetContainer=document.getElementById("ChangeAndLoadTargetContainer");
        this.ChangeAndLoadTargetTemplate=document.getElementById("ChangeAndLoadTargetTemplate");
        this.ChangeAndLoadTargetAddButton=document.getElementById("ChangeAndLoadTargetAddButton");

        this.ChangeAndLoadConfirmButton=document.getElementById("ChangeAndLoadConfirmButton");
        this.ChangeAndLoadCancelButton=document.getElementById("ChangeAndLoadCancelButton");
        this.EventSetHelper(this.ChangeAndLoadButton,"mouseup",async (e)=>{
            //DialogOpenラッパーにサブウィンドウチェックを入れるが、ChangeAndLoadダイアログはこのボタンからしか開かれることがないのでここでついでにチェックしてしまう
            if(e.button===0&&await LoadAndLayout.CheckPossibilityLoadORDelete()){//ダイアログが開かなければ読み込みができないのでここでサブウィンドウが開かれているか確認する
                this.ChangeAndLoadPathContainer.innerHTML="";
                //Canvasをチェックしてパス名の一覧を作成
                const ChangeAndLoadPathContainerFragment=document.createDocumentFragment();
                for(const [CanvasID,CanvasClass] of CanvasClassDictionary.entries()){
                    const LayerDataMap=CanvasClass.LayerDataMap;
                    let MaxPathLength=0;
                    const DisplayDataList=[];
                    for(const DataType of this.DataClassMap.keys()){
                        if(LayerDataMap.has(DataType)){
                            const DataID=LayerDataMap.get(DataType).get("DataID");
                            const Path=DicomDataClassDictionary.get(DataType).get(DataID).get("Data").Path;
                            const DisplayData=new Map([
                                ["DataType",DataType],
                                ["DataID",DataID],
                                ["Path",Path]
                            ]);
                            DisplayDataList.push(DisplayData);
                            const PathLength=Path.length;
                            MaxPathLength=Math.max(MaxPathLength,PathLength);
                        }
                    }
                    const CanvasInfoContainer=document.createElement("div");
                    CanvasInfoContainer.className="CanvasInfoContainer";
                    const CanvasInfoContainerFragment=document.createDocumentFragment();
                    const CanvasIDDisplay=document.createElement("div");
                    CanvasIDDisplay.className="CanvasIDDisplay";
                    CanvasIDDisplay.textContent=`CanvasID:${CanvasID}`;
                    CanvasInfoContainerFragment.appendChild(CanvasIDDisplay);
                    const DataTypeIDPathContainer=document.createElement("div");
                    DataTypeIDPathContainer.className="DataTypeIDPathContainer";
                    const DataTypeIDPathContainerFragment=document.createDocumentFragment();
                    const DataTypeIDDisplayContainer=document.createElement("div");
                    DataTypeIDDisplayContainer.className="DataTypeIDDisplayContainer";
                    const DataTypeIDContainerFragment=document.createDocumentFragment();
                    const PathDisplayContainer=document.createElement("div");
                    PathDisplayContainer.className="PathDisplayContainer";
                    PathDisplayContainer.tabIndex="-1";
                    const PathDisplayContainerFragment=document.createDocumentFragment();
                    const PathDisplayWidth=7*MaxPathLength+10;
                    for(const DisplayData of DisplayDataList){
                        const [DataType,DataID,Path]=DisplayData.values();
                        const DataTypeIDDisplay=document.createElement("div");
                        DataTypeIDDisplay.className="DataTypeIDDisplay";
                        DataTypeIDDisplay.textContent=`${DataType}:${DataID}`;
                        DataTypeIDContainerFragment.appendChild(DataTypeIDDisplay);
                        const PathDisplay=document.createElement("div");
                        PathDisplay.className="PathDisplay";
                        PathDisplay.textContent=Path;
                        PathDisplay.style.width=`${PathDisplayWidth}px`;
                        PathDisplayContainerFragment.appendChild(PathDisplay);
                    }
                    DataTypeIDDisplayContainer.appendChild(DataTypeIDContainerFragment);
                    PathDisplayContainer.appendChild(PathDisplayContainerFragment);
                    DataTypeIDPathContainerFragment.appendChild(DataTypeIDDisplayContainer);
                    DataTypeIDPathContainerFragment.appendChild(PathDisplayContainer);
                    DataTypeIDPathContainer.appendChild(DataTypeIDPathContainerFragment);
                    CanvasInfoContainerFragment.appendChild(DataTypeIDPathContainer);
                    CanvasInfoContainer.appendChild(CanvasInfoContainerFragment);
                    ChangeAndLoadPathContainerFragment.appendChild(CanvasInfoContainer);
                }
                this.ChangeAndLoadPathContainer.appendChild(ChangeAndLoadPathContainerFragment);
                /*
                ChangeAndLoadTargetContainerに一つ目のターゲット入力欄を追加する
                新しいターゲットの追加は追加ボタンの前に挿入する
                */ 
                //初期化
                const ChangeAndLoadTargetArray=this.ChangeAndLoadTargetContainer.querySelectorAll(":scope>div.ChangeAndLoadTarget");
                ChangeAndLoadTargetArray.forEach((TargetElement)=>TargetElement.remove());
                const ChangeAndLoadTarget=this.ChangeAndLoadTargetTemplate.content.cloneNode(true);
                this.ChangeAndLoadTargetContainer.insertBefore(ChangeAndLoadTarget,this.ChangeAndLoadTargetAddButton);
                this.ChangeAndLoadDialog.showModal();
            }
        });
        //ChangeAndLoadTargetの追加処理
        //ChangeAndLoadTargetの削除処理
        this.EventSetHelper(this.ChangeAndLoadTargetContainer,"mouseup",(e)=>{
            if(e.button===0){
                //console.log(e.target);
                if(e.target.tagName==="BUTTON"){
                    const TargetButton=e.target;
                    if(TargetButton===this.ChangeAndLoadTargetAddButton){
                        const NewTarget=this.ChangeAndLoadTargetTemplate.content.cloneNode(true);
                        this.ChangeAndLoadTargetContainer.insertBefore(NewTarget,this.ChangeAndLoadTargetAddButton);
                    }else if(TargetButton.className==="ChangeAndLoadTargetDeleteButton"){
                        //親を辿って削除対象のdivを補足する
                        const DeleteTarget=TargetButton.closest("div.ChangeAndLoadTarget");
                        if(DeleteTarget){
                            DeleteTarget.remove();
                        }
                    }
                }
            }
        });
        
        this.EventSetHelper(this.ChangeAndLoadConfirmButton,"keydown",async (e)=>{
            if(e.code==="Enter"){
                await this.ChangeAndLoad();
            }
        });
        this.EventSetHelper(this.ChangeAndLoadConfirmButton,"mouseup",async (e)=>{
            if(e.button===0){
                await this.ChangeAndLoad();
            }
        });
        this.EventSetHelper(this.ChangeAndLoadCancelButton,"keydown",async (e)=>{
            if(e.code==="Enter"){
                this.ChangeAndLoadDialog.close();
            }
        });
        this.EventSetHelper(this.ChangeAndLoadCancelButton,"mouseup",(e)=>{
            if(e.button===0){
                this.ChangeAndLoadDialog.close();
            }
        });
    }
    /*
    画面リセットメソッド
    リセットボタンとChangeAndLoadの両方から使うので分離する
    前者はレイアウトリセットも行い、後者はレイアウトリセットは行わない
    */
    /*ダイアログの開閉に関するメソッド*/
    LoadDialogClose(){
        this.LoadDialog.close();
    }
    //LoadDialogをオープンする時に、Canvasの新設か既存キャンバスへの処理か指定させる
    async LoadDialogOpen(_TargetCanvasID=99999,LoadTarget="AllDataType"){//どのキャンバスを対象にしているか
        /*ターゲット判定ステップ
        1．TargetCanvasIDをキーとするCanvasが存在するか→既存のCanvasを対象としている
        2．TargetCanvasID>=0→Canvasの新設
        3. 無効←ここはこの段階で弾く
        */
        const TargetCanvasID=parseInt(_TargetCanvasID);
        if(await LoadAndLayout.CheckPossibilityLoadORDelete()&&TargetCanvasID>=0){
            if(this.DataClassMap.has(LoadTarget)){
                //特定のDOMTreeだけ追加する
                const TargetDataClass=this.DataClassMap.get(LoadTarget);
                this.LoadDialogDOMTreeContainer.innerHTML="";//初期化
                //複数選択するかはそのタイプのデフォルトでOK, Originalのデータを必要とするタイプはいちいちオリジナルを選択するのが面倒である。そこで、TargetCanvasIDを引数に渡してデフォルト選択した状態のDOMツリーを作るようにした
                const TargetDataClassLoadDOMTree=TargetDataClass.setPathSelectDOMTree(TargetCanvasID);
                //渡されたDOMTreeのIDがDataTypeになっている。
                this.LoadDialogDOMTreeContainer.appendChild(TargetDataClassLoadDOMTree);
                //Confirmボタンにキャンバスの新設かどうかの情報を付与
                this.LoadDialogConfirmButton.setAttribute("data-TargetCanvasID",TargetCanvasID);
                this.LoadDialog.showModal();
            }else if(LoadTarget==="AllDataType"){
                this.LoadDialogDOMTreeContainer.innerHTML="";//初期化
                //すべてのDOMTreeを追加する
                const LoadDialogDOMTreeContainerFragment=document.createDocumentFragment();
                for(const TargetDataClass of this.DataClassMap.values()){
                    const TargetDataClassLoadDOMTree=TargetDataClass.setPathSelectDOMTree(TargetCanvasID,"");//複数選択抑制
                    LoadDialogDOMTreeContainerFragment.appendChild(TargetDataClassLoadDOMTree);
                }
                this.LoadDialogDOMTreeContainer.appendChild(LoadDialogDOMTreeContainerFragment);
                this.LoadDialogConfirmButton.setAttribute("data-TargetCanvasID",TargetCanvasID);
                this.LoadDialog.showModal();
            }
        }
    }
    async DialogLoadingStart(){//createCanvasへのラッパー
        //Dialogの入力を見て各データクラスにデータの読み込みを依頼する
        //DOMTreeの子のIDからセットされているDataTypeを収集する
        const DataLoadResultMap=new Map();
        const DataClassLoadDOMTreeList=Array.from(this.LoadDialogDOMTreeContainer.querySelectorAll(":scope>div.PathSelectDOMTree"));
        const DataTypeList=DataClassLoadDOMTreeList.map((element)=>{return element.id});//["CT","MASK",...]のようになる
        let OutputArrayMaxLength=-999;
        let OutputArrayMinLength=999;
        for(const DataType of DataTypeList){
            //console.log(DataType);//Dialogに設置されたデータタイプが表示される
            const DataClass=this.DataClassMap.get(DataType);
            const LoadResult=await DataClass.LoadingFromDialog();
            //console.log(DataType,"DataIDのチェック",LoadResult);
            if(LoadResult){//falseが返ってきてなければちゃんと読み込まれている
                //LoadResult=[DataID,...]
                DataLoadResultMap.set(DataType,LoadResult);
                const length=LoadResult.length;
                OutputArrayMaxLength=Math.max(OutputArrayMaxLength,length);
                OutputArrayMinLength=Math.min(OutputArrayMinLength,length);
            }
        }
        //console.log(DataLoadResultMap);
        //DataLoadReusltMapをもとにDataInfoMapのArrayを作成
        const DataInfoMapList=[];
        for(let i=0;i<OutputArrayMaxLength;i++){
            const DataInfoMap=new Map();
            for(const [DataType,DataIDList] of DataLoadResultMap.entries()){
                if(i in DataIDList){//そのインデックスが存在しているか＝その長さがあるか
                    DataInfoMap.set(DataType,DataIDList[i]);
                }
            }
            DataInfoMapList.push(DataInfoMap);
        }
        //TargetCanvasIDをConfirmButtonから取得
        const TargetCanvasID=parseInt(this.LoadDialogConfirmButton.getAttribute("data-TargetCanvasID"));
        //既存のCanvasIDならSetLayer、そうじゃないならCanvasを新設する
        if(CanvasClassDictionary.has(TargetCanvasID)){
            const TargetCanvas=CanvasClassDictionary.get(TargetCanvasID);
            for(const DataInfoMap of DataInfoMapList){//ここで繰り返しは起こらないはず
                TargetCanvas.SetLayer(DataInfoMap);
                //一応再描画命令
                //ただし、SetLayer内では特に再描画フラグの設定をしていないのでたとえばズームパン後にこれを行っても再描画が起こらないかも
                for(const DataType of DataInfoMap.keys()){
                    TargetCanvas.Layerdraw(DataType);
                }
            }
        }else{//TargetCanvasがない＝存在しないTargetCanvasIDだった
            for(const DataInfoMap of DataInfoMapList){//
                this.CreateNewCanvasBlock(DataInfoMap);
            }
            this.ResizeExecution();
        }
        /*読み込まれた状態を更新*/
        this.UpdateCanvasIDDataTypeMap();
    }
    async ChangeAndLoad(){
        const ConfirmConduct=false;
        let ConfirmResult=true;
        if(ConfirmConduct){
            //ConfirmResult=window.confirm("一括変更では処理結果にかかわらず画面がリセットされます。\n不正なパス変更がされた場合、画面がリセットされるのみとなりますがよろしいですか？");
        }
        if(!ConfirmResult){
            //console.log("一括変更がキャンセルされました。");
        }else{
            this.ChangeAndLoadDialog.close();
            /*
            ChangeAndLoadが確定したら、その後ロードが正常に終了するか否かに関わらず、Canvasの状態を保存した後に盤上をリセットする。
            */
            /*
            Step 1
            DicomDataDictionaryを参照してパス一覧だけ抽出する。
            Canvasごとの情報を保持する。CanvasIDごとに、レイヤーの情報(DataType,DataID)と盤上の位置情報を記録する
            その後盤上をリセットする
            */
            /*DicomDataClassDictionaryからDataType,DataID,FilePathを退避させる*/
            const DicomDataPathMap=new Map();
            for(const [DataType,DataIDDicomDataMap] of DicomDataClassDictionary){
                if(DataIDDicomDataMap.size>0){
                    const DataIDPathMap=new Map();//CanvasID,Path
                    for(const [DataID,DicomDataMap] of DataIDDicomDataMap){
                        //DicomDataMap={"Data":,"RefCount":}
                        const Path=DicomDataMap.get("Data").Path;
                        DataIDPathMap.set(DataID,Path);
                    }
                    DicomDataPathMap.set(DataType,DataIDPathMap);//{DataType:{DataID:Path}}
                }
            }
            /*盤上の状態を保存*/
            const CanvasDataMap=new Map();
            for(const [CanvasID,CanvasClass] of CanvasClassDictionary.entries()){
                //DataInfoMapを作成
                const DataInfoMap=new Map();
                for(const [DataType,LayerData] of CanvasClass.LayerDataMap.entries()){
                    const DataID=LayerData.get("DataID");
                    DataInfoMap.set(DataType,DataID);
                }
                const CanvasLP=this.CanvasID2GridNumberMap.get(CanvasID);
                const CanvasIDDataMap=new Map([
                    ["DataInfoMap",DataInfoMap],
                    ["LP",CanvasLP]
                ]);
                CanvasDataMap.set(CanvasID,CanvasIDDataMap);
            }
            //パスと画面配置を記憶したので消す。ただし、LayoutGridはそのままにする
            await this.ResetCanvas(false);
            /*
            パスを変更して新しいDicomDataDictionaryを作成し、新旧DataIDの変換Mapを作成する。
            変換MapはMASKDIFFやCONTOURの読み込みでも使用する。
            */
            /*
            const PatternTargetMap=new Map([
                ["Before",this.ChangeAndLoadTargetInput1.value],
                ["After",this.ChangeAndLoadTargetInput2.value]
            ]);
            */
            /*
            {
                Before:[text,text,...,]
                After:[text,text,...,]
            }
            */
            const ChangeAndLoadTargetArray=Array.from(this.ChangeAndLoadTargetContainer.querySelectorAll(":scope>div.ChangeAndLoadTarget"));
            const PatternTargetMap=new Map();
            for(let i=0;i<ChangeAndLoadTargetArray.length;i++){
                const ChangeMiddlePattern=`<${i}>`;//< ,　> はファイルパスに使われないので変換中間文字列として適している
                const ChangeAndLoadTarget=ChangeAndLoadTargetArray[i];
                const InputBefore=ChangeAndLoadTarget.querySelector(":scope>input.InputBefore");
                const InputAfter=ChangeAndLoadTarget.querySelector(":scope>input.InputAfter");
                const BeforePattern=InputBefore.value;
                const AfterPattern=InputAfter.value;
                const BeforeAndAfterPatternMap=new Map([
                    ["Before",BeforePattern],
                    ["After",AfterPattern]
                ]);
                PatternTargetMap.set(ChangeMiddlePattern,BeforeAndAfterPatternMap);
            }
            console.log(PatternTargetMap);
            const Old2NewDataIDMap=new Map();//{DataType:{OldDataID:NewID}}
            let ChangeAndLoadCancelFlag=false;//存在しないパスが読み込まれた場合、今回の変更は白紙にしてリセットして消してしまった画面を復元する
            for(const [DataType,DataTypeDataPathMap] of DicomDataPathMap.entries()){
                const DataTypeClass=this.DataClassMap.get(DataType);
                //パス変換はDataTypeClassに担当させる
                const OldDataIDArray=Array.from(DataTypeDataPathMap.keys());
                const OldPathArray=Array.from(DataTypeDataPathMap.values());
                const NewPathArray=DataTypeClass.ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap);//ChangePathの時点でファイルパスが存在するか確かめる←DataTypeClass.Loadingで不正パス読み込み時にfalseを返すようになっているのでそいつの戻り値で判定可能
                //一つでも存在しないパスがあった場合、falseを返し、このループから抜ける
                //ResetCanvasで古いデータはすべて削除され、この時点で読み込み済みのデータは変更パスが存在したデータのみ
                //存在しないパスでループから抜けたときは、DicomDataClassをclearしてデータの読み込み状態をリセットする。Canvasはすでにリセット済みなのでここでは不要
                const NewDataIDArray=await DataTypeClass.Loading(NewPathArray);
                if(NewDataIDArray){//パターン変更の結果不正なパスが一つでも含まれていた場合、falseが返ってくる
                    //OldDataID=>NewDataIDのMapを作成
                    const Old2NewDataIDPareArray=[];
                    for(let i=0;i<Math.min(OldDataIDArray.length,NewDataIDArray.length);i++){
                        Old2NewDataIDPareArray.push([OldDataIDArray[i],NewDataIDArray[i]]);
                    }
                    const DataTypeOld2NewDataIDMap=new Map(Old2NewDataIDPareArray);
                    Old2NewDataIDMap.set(DataType,DataTypeOld2NewDataIDMap);
                }else{
                    ChangeAndLoadCancelFlag=true;
                    //forループを中断する
                    break;
                }
            }
            //もしパターン変換したファイルパスの読み込みが中断されているなら
            /*
            パターンマッチでマッチする部分がない場合は古いパスに変更が加えられずにそのまま再読み込みになるが
            マッチして変更が加えられた結果不正パスになる場合がある。
            パス変更とデータローディングのループを分離できればいいが、DataIDなどを指定するタイプのデータは、CTやMASKなど先に読み込まれたデータが逐次的に記録した新しいDataIDを必要とするため、ループは分離不可能
            そもそも、DataIDなどのパスはパス存在の判定ができないためループ分離はそもそも不可能である。
            よって、下のように同じ処理を繰り返し書く必要が出てくる
            */
            if(ChangeAndLoadCancelFlag){
                console.log("ChangeAndLoadキャンセル&変更開始前に復帰モード");
                /*ここで行われる処理は上記の処理と全く同じである*/
                //DicomDataClassDictionaryとOld2NewDataIDMapを初期化する
                for(const DataTypeDataMap of DicomDataClassDictionary.values()){
                    DataTypeDataMap.clear();
                }
                Old2NewDataIDMap.clear();
                //PatternTargetMapのAfterの部分をBeforeの部分に一致させる
                for(const BeforeAndAfterPatternMap of PatternTargetMap.values()){
                    const BeforePattern=BeforeAndAfterPatternMap.get("Before");
                    BeforeAndAfterPatternMap.set("After",BeforePattern);//これで同じパスが読み込まれるようになる
                }
                //古いパスの再読み込みを行う
                for(const [DataType,DataTypeDataPathMap] of DicomDataPathMap.entries()){
                    const DataTypeClass=this.DataClassMap.get(DataType);
                    const OldDataIDArray=Array.from(DataTypeDataPathMap.keys());
                    const OldPathArray=Array.from(DataTypeDataPathMap.values());
                    const NewPathArray=DataTypeClass.ChangePath(OldPathArray,PatternTargetMap,Old2NewDataIDMap);
                    const NewDataIDArray=await DataTypeClass.Loading(NewPathArray);
                    const Old2NewDataIDPareArray=[];
                    for(let i=0;i<Math.min(OldDataIDArray.length,NewDataIDArray.length);i++){
                        Old2NewDataIDPareArray.push([OldDataIDArray[i],NewDataIDArray[i]]);
                    }
                    const DataTypeOld2NewDataIDMap=new Map(Old2NewDataIDPareArray);
                    Old2NewDataIDMap.set(DataType,DataTypeOld2NewDataIDMap);
                }
            }
            /*CanvasDataMapに対して、DataIDの変換⇒DataInfoMapの作成、Canvasの作成を行う*/
            const NewCanvasIDLPMap=new Map();
            for(const [CanvasID,LPDataInfoMap] of CanvasDataMap.entries()){
                const LP=LPDataInfoMap.get("LP");
                const OldDataInfoMap=LPDataInfoMap.get("DataInfoMap");//{DataType:DataID}
                const NewDataInfoMap=new Map(
                    Array.from(OldDataInfoMap.entries()).map(([DataType,OldDataID])=>{
                        const NewDataID=Old2NewDataIDMap.get(DataType).get(OldDataID);
                        return [DataType,NewDataID];
                    })
                );
                const NewCanvasID=this.CreateNewCanvasBlock(NewDataInfoMap);
                NewCanvasIDLPMap.set(NewCanvasID,LP);
            }
            /*
            すべて画面に配置し終わったら正しい位置に再配置する
            そのためにはCanvasIDとLPの紐づけが必要
            */
            this.ResetLayoutStatus(false)//CanvasID2GridNumberMapとGridNumber2CanvasIDArrayを初期化する
            for(const [NewCanvasID,LP] of NewCanvasIDLPMap.entries()){
                this.CanvasID2GridNumberMap.set(NewCanvasID,LP);
                this.GridNumber2CanvasIDArray[LP]=NewCanvasID;
            }
            this.UpdateCanvasPosition();//CanvasのDOMTreeのスタイルを書き換えて位置交換を反映する
            this.ResizeExecution();
            console.log("パス変更＆読み込み完了");
            /*データの読み込み状況を更新*/
            this.UpdateCanvasIDDataTypeMap();
        }
        //console.log("読み込み＆再配置が完了しました。");
    }
    /*Canvasの位置情報を更新する*/
    UpdateCanvasPositionInfomation(newRows,newColumns){
        //初期化
        /*
        this.GridNumber2CanvasIDArray=Array(newRows*newColumns).fill(-1);
        //埋めていく
        let newLP=0;
        for(const cid of this.CanvasID2GridNumberMap.keys()){
            this.CanvasID2GridNumberMap.set(cid,newLP);
            this.GridNumber2CanvasIDArray[newLP]=cid;
            newLP++;
        }*/
        let newLP=0;
        for(let lp=0;lp<this.GridNumber2CanvasIDArray.length;lp++){
            const cid=this.GridNumber2CanvasIDArray[lp];
            if(cid!=-1){
                this.CanvasID2GridNumberMap.set(cid,newLP);
                newLP++;
            }
        }
        this.GridNumber2CanvasIDArray=Array(newRows*newColumns).fill(-1);
        for(const [cid,lp] of this.CanvasID2GridNumberMap.entries()){
            this.GridNumber2CanvasIDArray[lp]=cid;
        }
        //inputの値、previousの値の変更
        this.RowsInput.value=newRows;
        this.CurrentRowsNum=newRows;
        this.ColumnsInput.value=newColumns;
        this.CurrentColumnsNum=newColumns;
    }
    UpdateCanvasMovePositionButtonContainer(){
        //初期化
        this.CanvasMovePositionButtonContainer.innerHTML="";
        //ChangeCanvasLayoutDialogのボタンの配置を更新する
        this.CanvasMovePositionButtonContainer.style.gridTemplateColumns=`repeat(${this.CurrentColumnsNum},1fr)`;
        this.CanvasMovePositionButtonContainer.style.gridTemplateRows=`{repeat(${this.CurrentRowsNum},1fr)}`;
        const gap=5;
        this.CanvasMovePositionButtonContainer.style.gap=`${gap}px`;
        const ButtonSize=75;//px
        this.CanvasMovePositionButtonContainer.style.width=`${ButtonSize*this.CurrentColumnsNum+gap*(this.CurrentColumnsNum-1)}px`;
        this.CanvasMovePositionButtonContainer.style.height=`${ButtonSize*this.CurrentRowsNum+gap*(this.CurrentRowsNum-1)}px`;
        const CanvasMovePositionButtonContainerFragment=document.createDocumentFragment();
        //現在のgridの状態を基にチェックボックスを配置する
        for(let lp=0;lp<this.GridNumber2CanvasIDArray.length;lp++){
            const r=Math.floor(lp/this.CurrentColumnsNum)+1;
            const c=lp%this.CurrentColumnsNum+1;
            //const label=document.createElement("MaskLabel");
            const button=document.createElement("button");
            button.tabIndex="-1";
            button.style.width=`${ButtonSize}px`;
            button.style.height=`${ButtonSize}px`;
            button.value=lp;
            CanvasMovePositionButtonContainerFragment.appendChild(button);
            button.style.gridArea=`${r}/${c}/${r+1}/${c+1}`;
            //ボタンの色を決定する
            const CanvasID=this.GridNumber2CanvasIDArray[lp];
            if(CanvasID>=0){
                //画像があるLPである
                button.setAttribute("data-EmptyStatus","NotEmpty");
                const LayarMapArray=Array.from(CanvasClassDictionary.get(CanvasID).LayerDataMap.keys());
                const textContent=`CanvasID:${CanvasID}\n`+LayarMapArray.join("\n");
                button.textContent=textContent;
            }else{
                button.setAttribute("data-EmptyStatus","Empty");
            }
        }
        this.CanvasMovePositionButtonContainer.appendChild(CanvasMovePositionButtonContainerFragment);
        /*Gridが変わると、空いてる場所に単純にCanvasを詰めていくことになるため、選択状態は解除する*/
        this.ClearCanvasMovePositionButtonSelect();
    }
    ClearCanvasMovePositionButtonSelect(ReturnButtonArrayFlag=false){
        const SelectedCanvasMovePositionButtonArray=Array.from(this.CanvasMovePositionButtonContainer.querySelectorAll(":scope>button.Selected"));
        SelectedCanvasMovePositionButtonArray.forEach((PositionButton)=>{
            PositionButton.classList.remove("Selected");
        });
        this.CanvasMovePositionSelectedCount=0;
        //必要があれば選択されてたButtonを返すよ
        //あとはそちら側で値の抽出なりを行ってね
        if(ReturnButtonArrayFlag){
            return SelectedCanvasMovePositionButtonArray;
        }
    }
    /*位置情報を基にCanvasの場所を実際に変更する*/
    UpdateCanvasPosition(){
        //実際にスタイルを変更する部分
        //CanvasのLPとgridを参考にして位置を適用していく
        //styleを書き換えた時点で多分反映される
        for(const [cid,LP] of this.CanvasID2GridNumberMap.entries()){
            const canvas=CanvasClassDictionary.get(cid);
            const r=Math.floor(LP/this.CurrentColumnsNum)+1;
            const c=LP%this.CurrentColumnsNum+1;
            //gridRow, gridColumnは1スタート
            //canvas.Block.style.gridRow=`${r+1}`;
            //canvas.Block.style.gridColumn=`${c+1}`;
            canvas.Block.style.gridArea=`${r}/${c}/${r+1}/${c+1}`;
            //console.log(`${this.CurrentRowsNum}, ${this.CurrentColumnsNum}, | ${cid}, ${LP} (${r+1},${c+1})`);
        }
        CanvasContainer.style.columnGap=`${this.gridgap}px`;
        CanvasContainer.style.rowGap=`${this.gridgap}px`;
        CanvasContainer.style.gridTemplateColumns=`repeat(${this.CurrentColumnsNum},1fr)`;
        CanvasContainer.style.gridTemplateRows=`repeat(${this.CurrentRowsNum},1fr)`;
        //
    }
    /*GridChangeの本体*/
    ChangeCanvasGrid(){
        //変更処理
        //CanvasBlockの格子配置が変更されたら、詰めて配置しなおすことにする
        const newRows=parseInt(this.RowsInput.value)||this.CurrentRowsNum;
        const newColumns=parseInt(this.ColumnsInput.value)||this.CurrentColumnsNum;
        if(newRows*newColumns<CanvasClassDictionary.size){
            console.log(`現在のCanvasBlockの個数は ${CanvasClassDictionary.size} です。`);
            return;
        }
        if(!(this.CurrentRowsNum==newRows&&this.CurrentColumnsNum==newColumns)){
            /*
            やらないといけない処理
            位置情報の更新⇒位置を変更⇒Windowsizeの最適化⇒サブウィンドウ向けデータ送信
            ダイアログのボタンの配置を更新
            */
            //Grid情報を更新
            this.UpdateCanvasPositionInfomation(newRows,newColumns);
            //CanvasMovePositionButtonを再配置
            this.UpdateCanvasMovePositionButtonContainer();
            //更新した情報を基にスタイル変更
            this.UpdateCanvasPosition();
            this.ResizeCalculation();//仮想的にサイズを計算
            this.ResizeExecution();//実際に反映
            //新しい位置情報を送信する
            this.SendMainWindowStatus();
        }
    }
    CreateNewCanvasBlock(DataInfoMap){
        //キャンバスの作成と登録
        const NewCanvasID=CanvasNextID;
        const NewCanvas=new Canvas(NewCanvasID);
        CanvasClassDictionary.set(NewCanvasID,NewCanvas);
        NewCanvas.InitializeEventFunctions(DataInfoMap);
        CanvasNextID++;
        //キャンバスの作成と、IDとgridの紐づけを行う
        //現在空いている場所はあるか？
        if(CanvasClassDictionary.size>this.CurrentRowsNum*this.CurrentColumnsNum){
            //空きがない状態なので、アップデートして空きを作る
            /*
            const currentbodyrect=document.body.getBoundingClientRect();
            const w=currentbodyrect.width,h=currentbodyrect.height;
            */
            const w=this.previousBodyOrderWidth;
            const h=this.previousBodyOrderHeight;
            //横長なら行を追加、縦長なら列を追加する
            //console.log("空きがない状態",w,h);
            console.log(w,h);
            if(w>=h){
                console.log("行を増やす");
                this.UpdateCanvasPositionInfomation(this.CurrentRowsNum+1,this.CurrentColumnsNum);
            }else if(w<h){
                console.log("列を増やす");
                this.UpdateCanvasPositionInfomation(this.CurrentRowsNum,this.CurrentColumnsNum+1);
            }
        }
        //ここまでに必ず空きがある状態にする
        const newLP=this.GridNumber2CanvasIDArray.indexOf(-1);
        this.GridNumber2CanvasIDArray[newLP]=NewCanvasID;
        this.CanvasID2GridNumberMap.set(NewCanvasID,newLP);
        //スタイルを変更する
        this.UpdateCanvasPosition();
        this.ResizeCalculation();//仮想サイズの計算だけ行う
        return NewCanvasID;//とりあえず新しいCanvasIDを返す
    }
    async delateCanvas(CanvasID,UpdateCanvasIDDataTypeMapFlag=true){
        if(await LoadAndLayout.CheckPossibilityLoadORDelete()){
            console.log("delateCanvas");
            //const CanvasClass=CanvasClassDictionary.get(CanvasID);
            //削除対象で参照されているデータを消そうとしてみる
            /*
            for(const [DataType,LayerData] of CanvasClass.LayerDataMap.entries()){
                const DataID=LayerData.get("DataID");
                const DicomDataInfoMap=DicomDataClassDictionary.get(DataType).get(DataID);
                const RefCount=DicomDataInfoMap.get("RefCount");
                DicomDataInfoMap.set("RefCount",RefCount-1);
                this.TryDeleteDicomData(DataType,DataID);
                if(DataType==="MASK"){
                    colormapformask.update();
                }
            }
            */
            //キャンバスクラスを削除する
            //内部でイベント解除、参照しているデータの削除、DOMツリー切り離しが行われる。
            Canvas.dispose(CanvasID);
            CanvasClassDictionary.delete(CanvasID);//Mapから削除。これでガーベージコレクションが動くはず
            colormapformask.update();//変化がなければ何も起こらないので気軽に呼び出してOK
            //削除によるRowとColumnの変更はしないものとする。
            const delateLP=this.CanvasID2GridNumberMap.get(CanvasID);
            this.GridNumber2CanvasIDArray[delateLP]=-1;
            this.CanvasID2GridNumberMap.delete(CanvasID);
            /*データの読み込み状況を更新*/
            if(UpdateCanvasIDDataTypeMapFlag){//単独削除時はここで更新がかかる
                this.UpdateCanvasIDDataTypeMap();
            }
        }
    }
    async ResetCanvas(LayoutGridReset=false){
        if(await LoadAndLayout.CheckPossibilityLoadORDelete()){
            //Canvasを消す
            //console.log(CanvasClassDictionary);
            for(const CanvasID of CanvasClassDictionary.keys()){
                await this.delateCanvas(CanvasID,false);//この後まとめてUpdateCanvaIDDataTypeMapを行う
            }
            //DicomDataClassもリセットする
            //ここでBGCTもリセットされる
            //console.log("次はBGCTも消すぞ")
            for(const [key,DataTypeClassMap] of DicomDataClassDictionary.entries()){
                //console.log(key);
                DataTypeClassMap.clear();
            }
            //一応CanvasClassもリセットする
            console.log("CanvasClassDictionary Clear");
            CanvasClassDictionary.clear();
            //Layoutでは、画像を削除してもgridは変更しないようにしているため、それを初期化する
            this.ResetLayoutStatus(LayoutGridReset);
            //console.log(document.activeElement);
            this.UpdateCanvasIDDataTypeMap();
        }
    }
    //余裕を持たせるためにディスプレイサイズから少しだけ小さい値をデフォルトにする。
    //現在の実装方法では、bodyサイズは指定できるがウィンドウの上らへんにあるOS依存ぽいスペースまで正確に制御できていない状況もあいまって余裕を持たせるようにしている
    async ResizeCalculation(width=this.DisplayWidth-50,height=this.DisplayHeight-50){
        if(CanvasClassDictionary.size!==0){//キャンバスがないなら何もしな
            console.log("Windowサイズの計算");
            //とりあえずはcolumnsの方向で増やしていく応急処理
            //this.CurrentColumnsNum=CanvasClassDictionary.size;
            let basewidth=-Infinity,baseheight=-Infinity;
            //基準となる高さを決める
            for(const canvasclass of CanvasClassDictionary.values()){
                const width=canvasclass.Width;
                const height=canvasclass.Height;
                if(width>basewidth)basewidth=width;
                if(height>baseheight)baseheight=height;
            }

            const CellWidth=(width-(this.CurrentColumnsNum-1)*this.gridgap)/this.CurrentColumnsNum;
            const CellHeight=(height-(this.CurrentRowsNum-1)*this.gridgap-this.menuheight)/this.CurrentRowsNum;
            //console.log("DisplaySize",this.DisplayWidth,this.DisplayHeight);
            //console.log("CellSize",CellWidth,CellHeight);
            const BaseCanvasWidth=basewidth;
            const BaseCanvasHeight=baseheight-this.sliderheight;
            // BaseSizeの因数分解
            // Width,heightで2^h,2^wと異なる可能性があるため、小さいほうを採用する
            // 2の1乗⇒0.5刻み
            // 2の２乗⇒0.25刻み
            let N=0;
            const basevalue=2
            let bw=BaseCanvasWidth;
            let bh=BaseCanvasHeight;
            while(bw%basevalue===0&&bh%basevalue===0){
                N++;
                bw/=2;
                bh/=2;
            }
            //console.log("BaseCanvasSize",BaseCanvasWidth,BaseCanvasWidth);
            //console.log(`2^${N}`);
            const scalestep=Math.pow(basevalue,N);
            //console.log("ScaleStep 1/",scalestep);
            const wrate=CellWidth/BaseCanvasWidth;
            const hrate=(CellHeight-this.sliderheight)/BaseCanvasHeight;
            //console.log("scale",wrate,hrate);
            //小さいほうのレートに対してそれを超えない最小の0.5刻みの数字を得る
            //scaleは0.5を下回らないようにする。
            const scale=Math.max(Math.floor(Math.min(wrate,hrate)*scalestep)/scalestep,1/scalestep);
            //console.log("リサイズの倍率",scale);
            const CanvasWidth=BaseCanvasWidth*scale;
            const CanvasHeight=BaseCanvasHeight*scale;
           
            //Windowのコンテンツサイズを変更する
            const WindowContentWidth=CanvasWidth*this.CurrentColumnsNum+this.gridgap*(this.CurrentColumnsNum-1);
            const WindowContentHeight=this.menuheight+(CanvasHeight+this.sliderheight)*this.CurrentRowsNum+this.gridgap*(this.CurrentRowsNum-1);
            this.previousBodyOrderWidth=WindowContentWidth;
            this.previousBodyOrderHeight=WindowContentHeight;
        }
    }
    //複数読み込み時などに備えて、仮想的にサイズを調整するクラスと実際に調整するクラスを分離する。
    //そうすれば、連続読み込みとデバウンスの衝突を回避できそうだ。
    async ResizeExecution(){
        //ウィンドウリサイズの実行部分
        if(CanvasClassDictionary.size!==0){
            this.ResizeCount++;
            console.log(`Windowサイズ再調整 ${this.ResizeCount} 回目`);
            document.body.style.width=this.previousBodyOrderWidth;
            document.body.style.height=this.previousBodyOrderHeight;
            //console.log("ContentSize",WindowContentWidth,WindowContentHeight);
            this.ResizableFlag=false;
            console.log("リサイズ処理開始",new Date().toISOString());
            const ResizeResult=await window.MainWindowResizeAPI(this.previousBodyOrderWidth,this.previousBodyOrderHeight);//これによってもう一度無駄にresizeが発火する
            //console.log(ResizeResult);
            this.ResizableFlag=true;
            console.log("リサイズが終わったのでフラグをtrueにしたよ",new Date().toISOString());
            //console.log("ムーブ処理呼び出す");
            window.MainWindowMoveAPI();//ディスプレイで見切れないように動かす
            console.log("Windowサイズ調整終了");
        }
    }
    UpdateCanvasIDDataTypeMap(){//これはデータが削除されたり読み込まれたタイミングで都度呼び出す必要がある。
        const CanvasIDDataTypeMap=new Map();//{CanvasID:{DataType:DataID,...,},...}
        for(const [CanvasID,CanvasClass] of CanvasClassDictionary.entries()){
            const LoadedDataTypeDataIDMap=new Map();
            for(const [DataType,LayerData] of CanvasClass.LayerDataMap.entries()){
                const DataID=LayerData.get("DataID");
                LoadedDataTypeDataIDMap.set(DataType,DataID);
            }
            CanvasIDDataTypeMap.set(CanvasID,LoadedDataTypeDataIDMap);
        }
        this.CanvasIDDataTypeMap=CanvasIDDataTypeMap;
        //サブウィンドウが展開されていなくても空送信する
        this.SendMainWindowStatus();
    }
    /*
    SubWindow向けにメインウィンドウで読み込まれている画像とどこに配置されているかを送信する
    3つの情報をまとめて送信する
    */
    SendMainWindowStatus(){//データの追加削除が発生したとき、Canvasの移動が発生したときに呼び出す必要がある。
        /*CanvasIDごとに何が読み込まれているかまとめたデータを作成*/
        const SendingData=new Map([
            ["action","UpdateMainWindowStatus"],
            ["data",new Map([
                ["CanvasIDDataTypeMap",this.CanvasIDDataTypeMap],
                ["LayoutGridMap",new Map([
                    ["RowsNum",this.CurrentRowsNum],
                    ["ColumnsNum",this.CurrentColumnsNum]
                ])],
                ["CanvasID2GridNumberMap",this.CanvasID2GridNumberMap],
                ["GridNumber2CanvasIDArray",this.GridNumber2CanvasIDArray]
            ])]
        ]);
        //console.log("MainWindowの状態を送るよ")
        this.PassChangesToSubWindow(SendingData);
    }
    PassChangesToSubWindow(data){
        window.MainWindowRendererMainProcessAPI.FromMainToMainProcess(data);
    }
    //もしものためにヘルパーを使う
    EventSetHelper(element,event,callback){
        try{
            element.addEventListener(event,callback);
            //ElementsWithEventsに登録
            if(this.ElementsWithEvents.has(element)){
                //すでにエレメントが一度登録されている
                const elementMap=this.ElementsWithEvents.get(element);
                if(elementMap.has(event)){
                    //エレメントのeventが一度登録されている
                    elementMap.get(event).push(callback);
                }else{
                    //このイベントは初めてなので新しい配列を作って登録
                    elementMap.set(event,[callback]);
                }
            }else{
                //この要素が初めてなのでエレメントのMapを登録⇒eventのMAPを登録⇒callbackをプッシュする
                this.ElementsWithEvents.set(element,new Map([
                    [event,[callback]]
                ]));
            }
        }catch(error){
            //console.log(`EventSettingError\n${error}`);
        }
    }
}
const LoadAndLayoutFunctions=new LoadAndLayout();

/*SubWindowとの通信*/
/*下の３つの変数はSubwindowからの変更時にも使うので保持しておく*/
/*Windowが閉じたらリセットする*/
/*新しくSubWindowを開くたびに更新される*/
/*SubWindowを閉じるときには他のものに書き換わっているが、ヘッダーから特定できるので、問題はない*/

//MainProcessにSubWindowを開くように命令する関数
//SubWindowを開くときに、どのキャンバスのどのレイヤーに対してどのような操作を行うかを伝える必要がある。
//CanvasID,Layer,actionをMapでまとめて渡す
//actionはWindowing,MaskModifing,RoiSelectなど
function OrderSubWindowOpen(SendingData){
    //const currentheader=SendingData.get("header");
    //console.log("MainWindowRendererからMainProcessへ",SendingData);
    //SubWindowを開くようにMainProcessに命令する
    //CanvasID,Layer,actionをMapでまとめて渡す
    window.MainWindowRendererMainProcessAPI.OrderSubWindowOpen(SendingData);//SubWindowのRenderer側から、OPモードが必要かの返答を待つ
    //前回のサブウィンドウからの通信用のリスナーを初期化,サブウィンドウ終了後専用のチャンネルがあるので最後の通知はそちらから
    //このリスナーはサブウィンドウとメインウィンドウの双方向通信用であるため、一つのサブウィンドウにしか開通しない
    window.MainWindowRendererMainProcessAPI.RemoveFMPTM();
    window.MainWindowRendererMainProcessAPI.FromMainProcessToMain((event,data)=>{
        //const ReceivedDataBody=data.get("data");
        //const CanvasID=ReceivedDataBody.get("CanvasID");
        //const targetCanvasClass=CanvasClassDictionary.get(CanvasID);
        //targetCanvasClass.ReceiveChangesFromSubWindow(data);
        //console.log("SubWindowからデータが届いたよ");
        Canvas.ReceiveChangesFromSubWindow(data);
    });
}
/*
const EvaluateButton=document.getElementById("EvaluateButton");
EvaluateButton.addEventListener("mouseup",(e)=>{
    if(e.button==0){//左クリックだったら
        OrderEvaluateWindowOpen();
    }
});
*/
class Evaluate{
    /*2つの変換用静的メソッドはEvaluateRenderer側と同じになっている必要がある*/
    static Array2String(Array,delimita=":"){
        return Array.join(delimita);
    }
    static String2Array(String,delimita=":"){
        return String.split(delimita);
    }
    constructor(){
        this.EvaluateButton=document.getElementById("EvaluateButton");
        this.setUserEvents();
        //Evaluate機能は削除されたりしないのでEventsethelperは不要
    }
    setUserEvents(){
        this.EvaluateButton.addEventListener("mouseup",(e)=>{
            if(e.button==0){
                //評価可能かチェック
                if(CanvasClassDictionary.size>0 || true){
                    this.OrderEvaluateWindowOpen();
                }else{
                    console.log("評価対象がありません");
                }
            }
        });
        //SubWindowからの通信で行う処理をまとめる
        this.FromMainProcessToMainFunctions=new Map();
        //評価ウィンドウのエリアセレクトinputが確定した通知を受け取る
        //一緒に渡されるCanvasIDを参照し、それらの選択領域を更新する
        //評価ウィンドウからの入力や、一方の選択同期のときに共通で使われる
        //前者の際はEvaluateが複数回送ることになる
        const ChangeSelectedAreaFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const targetCID=ReceivedDataBody.get("targetCID");
            const SelectedArea=ReceivedDataBody.get("SelectedArea");//この中身はMaskModifyの形式と同じになるようにする
            //CanvasClassのReceiveSubWindowChangeに投げる用のデータを形成する
            //CanvasClassは通常通りSubWindowからの通信の様に振る舞う
            const dammydata=new Map([
                ["action","ChangeSelectedArea"],
                ["data",new Map([
                    ["CanvasID",targetCID],
                    ["SelectedArea",SelectedArea]
                ])]
            ]);
            //const targetCanvasClass=CanvasClassDictionary.get(targetCID);
            //targetCanvasClass.ReceiveChangesFromSubWindow(dammydata);
            Canvas.ReceiveChangesFromSubWindow(dammydata);
        }
        this.FromMainProcessToMainFunctions.set("ChangeCanvasesSelectedArea",ChangeSelectedAreaFunction);
        
        //選択されているCanvasを切り替える
        const ChangeTargetCanvasFunction=(data)=>{
            //body⇒data
            //TargetCID={"ON":CID,"OFF":CID}
            //SelectedArea
            const ReceivedDataBody=data.get("data");
            const TargetCanvasIDSet=ReceivedDataBody.get("TargetCanvasIDSet");
            console.log(TargetCanvasIDSet);
            const SelectedArea=ReceivedDataBody.get("SelectedArea");
            for(const [CanvasID,CanvasClass] of CanvasClassDictionary.entries()){
                let Activate=false;
                if(TargetCanvasIDSet.has(CanvasID)){//このCanvasは選択されているか
                    //選択されているので選択範囲の情報をまず送る。ModeSwitchingとの順番はどちらが先でもいいはず
                    const SelectedAreaData=new Map([
                        ["action","ChangeSelectedArea"],
                        ["data",new Map([
                            ["CanvasID",CanvasID],
                            ["SelectedArea",SelectedArea]
                        ])]
                    ]);
                    Canvas.ReceiveChangesFromSubWindow(SelectedAreaData);
                    //選択されたCanvasのサイズを送って、入力欄の境界判定に利用する
                    //共通のサイズの画像を比較することは前提条件だが、念のため通知しておくこととする
                    //MultiUseLayerのサイズは実際の画像サイズより大きく設定されることがあるため
                    //DrawStatusのoriginalimagewidth,heightを元々のサイズとして扱う
                    const SendingData=new Map([
                        ["action","FromMainToSubCanvasSize"],
                        ["data",new Map([
                            ["CanvasID",CanvasID],
                            ["originalimagewidth",CanvasClass.DrawStatus.get("originalimagewidth")],//Xサイズ
                            ["originalimageheight",CanvasClass.DrawStatus.get("originalimageheight")],//Yサイズ
                            ["originalslidermax",CanvasClass.DrawStatus.get("originalslidermax")]//Zサイズ-1
                        ])]
                    ]);
                    this.PassChangesToSubWindow(SendingData);//SubWindowに送る
                    Activate=true;
                }
                const ModeSwitchingData=new Map([
                    ["action","AreaSelectModeSwitching"],
                    ["data",new Map([
                        ["CanvasID",CanvasID],
                        ["Activate",Activate],
                    ])]
                ]);
                CanvasClass.ReceiveChangesFromSubWindow(ModeSwitchingData);
            }
        }
        this.FromMainProcessToMainFunctions.set("ChangeTargetCanvas",ChangeTargetCanvasFunction);
        /*計算確定ボタンが押されたときに、対象のボリュームを送信する*/
        //現在の構想では、ボリュームをサブウィンドウに送り、サブウィンドウレンダラーで計算を行うようにする
        const EvaluateStartFunction=(ReceiveData)=>{
            const ReceivedDataBody=ReceiveData.get("data");
            const TargetDataTypeSet=ReceivedDataBody.get("TargetDataTypeSet");
            const LoadDataKeySet=ReceivedDataBody.get("LoadDataKeySet");
            //評価対象になっているボリュームのサイズは選択されたときに送られているのでボリュームだけ送る
            const data=new Map();
            const VolumeMap=new Map();
            //メインレイヤーのデータを送る
            //CID:{"Path":path,"Volume",Volume}
            for(const TargetDataKey of LoadDataKeySet){
                //targetData="DataType:DataID"になっているはずなのでこれを翻訳
                const TargetDataKeyList=this.constructor.String2Array(TargetDataKey);
                //第一要素は文字列、第二要素は数値型なので文字列からparseInt
                const DataType=TargetDataKeyList[0];
                const DataID=parseInt(TargetDataKeyList[1]);
                //console.log(DataType);
                //DataTypeにチェックをする
                //Dataによってはプラスアルファで必要なものがあるかもしれないのでそれ用にチェックしておく
                const targetDicomData=DicomDataClassDictionary.get(DataType).get(DataID).get("Data");
                const targetVolume=targetDicomData.ImageVolume;
                //そのうち、Volumeデータじゃないものに対しても評価が必要になるかもしれない
                //その場合、以下のプロパティすべてを持っている保証はないのでゆくゆくは安全策をとる必要がある
                VolumeMap.set(TargetDataKey,new Map([
                    ["Path",targetDicomData.Path],
                    ["Size",new Map([["width",targetDicomData.width],["height",targetDicomData.height]])],
                    ["SpacingDataMap",new Map([
                        ["xSpacing",targetDicomData.xSpacing],//W方向用
                        ["ySpacing",targetDicomData.ySpacing],//H方向用
                        ["i2pMap",targetDicomData.i2p],//Index⇒PositionPatient変換する用のMap, Z方向用に使う
                    ])],
                    ["Volume",targetVolume],
                ]));
            }
            data.set("VolumeMap",VolumeMap);
            //プラスアルファのデータを送る
            /*マスク用*/
            const ExtraDataMap=new Map();
            if(TargetDataTypeSet.has("MASK")){
                ExtraDataMap.set("ColorMapLabelArray",colormapformask.label);
                ExtraDataMap.set("ColorMap",colormapformask.colormap);
            }
            data.set("ExtraDataMap",ExtraDataMap);
            const SendingData=new Map([
                ["action","FromMainToSubTargetVolume"],
                ["data",data]
            ]);
            this.PassChangesToSubWindow(SendingData);
        }
        this.FromMainProcessToMainFunctions.set("EvaluateStart",EvaluateStartFunction);
    }
    /*
    getDataTypeCanvasIDMap(){
        const DataTypeList=Array.from(DicomDataClassDictionary.keys());
        const DataTypeCanvasIDMap=new Map(
            DataTypeList.map(datatypekey=>[datatypekey,new Map()])
        );
        for(const canvasclass of CanvasClassDictionary.values()){
            //各キャンバスに現時点であるDataTypeを集計する
            const CanvasID=canvasclass.id.get("CanvasID");
            for(const [DataType,LayerData] of canvasclass.LayerDataMap.entries()){//Layerの名前はデータタイプと一致している
                //LayerData={"Layer":, "DataID":, }
                const DataID=LayerData.get("DataID");
                DataTypeCanvasIDMap.get(DataType).set(CanvasID,DataID);
            }
        }
        return DataTypeCanvasIDMap;//{DataType:{CanvasID:DataID,CanvasID:DataID,...,}}
    }
    */
    OrderEvaluateWindowOpen(){
        //body データタイプごとのCIDの入れ子Mapとする
        //BGのデータに対する評価はなしとする。つまり、評価指標に投げたい場合はメインとしてロードする必要がある
        const CanvasIDDataTypeMap=LoadAndLayoutFunctions.CanvasIDDataTypeMap;
        const SendingDataBody=new Map([
            ["CanvasIDDataTypeMap",CanvasIDDataTypeMap],//{DataType:{CanvasID:DataID,...,},...,}
            ["LayoutGridMap",new Map([
                ["RowsNum",LoadAndLayoutFunctions.CurrentRowsNum],
                ["ColumnsNum",LoadAndLayoutFunctions.CurrentColumnsNum],
            ])],//現在の画像を配置する枠組み
            ["CanvasID2GridNumberMap",LoadAndLayoutFunctions.CanvasID2GridNumberMap],//現在の画像配置枠組みのうち、どこに画像が配置されているか
            ["GridNumber2CanvasIDArray",LoadAndLayoutFunctions.GridNumber2CanvasIDArray],
            ["windowsize",[800,600]],
            ["AllowAddOrDeleteFlag",true],
        ]);
        const SendingData=new Map([
            ["action","Evaluate"],
            ["data",SendingDataBody]
        ])
        //console.log(SendingData);
        window.MainWindowRendererMainProcessAPI.OrderSubWindowOpen(SendingData);
        //通信経路の初期化
        window.MainWindowRendererMainProcessAPI.RemoveFMPTM();
        //通信経路の接続
        window.MainWindowRendererMainProcessAPI.FromMainProcessToMain((event,data)=>{
            this.ReceiveChangesFromSubWindow(data);
        });
    }
    PassChangesToSubWindow(data){
        window.MainWindowRendererMainProcessAPI.FromMainToMainProcess(data);
    }
    ReceiveChangesFromSubWindow(data){
        //dataの形式
        //header:action(Windowing, MaskModifyなどを含む)
        //body:action(changeRectangleなど)
        //get(body_actioin)で取得できるように関数を管理する
        //console.log(data);
        const bodyaction=data.get("action");
        //console.log(bodyaction);
        this.FromMainProcessToMainFunctions.get(bodyaction)(data);
    }
}
//有効化
const EvaluateFunctions=new Evaluate();
//window.MainWindowRendererMainProcessAPI.FromMainProcessToMain(FromMainProcessToMainCallback);
//SuBWindowが閉じられたときに呼ばれる
window.MainWindowRendererMainProcessAPI.CloseSubWindowFromMainProcessToMain((event,ClosingDataList)=>{
    for(const ClosingData of ClosingDataList){
        //headerにターゲットが書いてあるので見る
        //ヘッダーによってターゲットを指定するコンテキストメニューでも使用しているため、
        //bodyではなくヘッダーによるターゲットの指定を行っている。
        Canvas.ReceiveChangesFromSubWindow(ClosingData);
    }
});