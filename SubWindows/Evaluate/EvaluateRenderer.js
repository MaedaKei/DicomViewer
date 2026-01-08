console.log("EvaluateRenderer.js loaded");
let EvaluateObject=null;
class Evaluate{
    static Array2String(Array,delimita=":"){
        return Array.join(delimita);
    }
    static String2Array(String,delimita=":"){
        return String.split(delimita);
    }
    constructor(SendingData){
        //console.log(SendingData);
        /*HTML要素を保持*/
        //評価指標選択
        this.EvaluationFunctionSelecter=document.getElementById("EvaluationFunctionSelecter");
        //入力画像選択ダイアログ
        this.InputSelectDialogOpenButton=document.getElementById("InputSelectDialogOpenButton");
        this.InputSelectDialog=document.getElementById("InputSelectDialog");
        this.TargetDataTypeDisplay=document.getElementById("TargetDataTypeDisplay");
        this.TargetInputNumDisplay=document.getElementById("TargetInputNumDisplay");
        this.TargetDataTypeDisplay.textContent="TestPrint";
        this.TargetInputNumDisplay.textContent="TestPrint";
        this.CanvasSelectButtonContainer=document.getElementById("CanvasSelectButtonContainer");
        this.InputSelectDialogCloseButton=document.getElementById("InputSelectDialogCloseButton");
        //領域選択入力欄
        this.LeftTopXInput=document.getElementById("LeftTopXInput");
        this.LeftTopYInput=document.getElementById("LeftTopYInput");
        this.RectangleWidthInput=document.getElementById("RectangleWidthInput");
        this.RectangleHeightInput=document.getElementById("RectangleHeightInput");
        this.StartSliceInput=document.getElementById("StartSliceInput");
        this.EndSliceInput=document.getElementById("EndSliceInput");
        //Windowの位置を調整
        window.SubWindowMoveAPI();
        //確定ボタン
        this.CalculateConfirmButton=document.getElementById("CalculateConfirmButton");
        //計算履歴リスト
        /*
        CalclateID、評価指標、Inputの情報を表示する
        */
        this.CalculateHistoryList=document.getElementById("CalculateHistoryList");//ulエレメント
        //計算結果表示領域
        this.ResultContainer=document.getElementById("ResultContainer");
        //渡された引数を保持する
        const ReceivedDataBody=SendingData.get("data");
        this.InvalidCanvasID=(-99999);
        this.InvalidDataType="Invalid";
        this.InvalidDataID=(-99999);
        /*
        上の３つを使ってInput用のDialogを作成する
        上の３つはメインウィンドウに変更があるとリアルタイムで通知が来る
        そのときに更新され、そのタイミングでダイアログの再構成を行う
        あるいは、ダイアログが開かれていないときはリアルタイムでダイアログの再生成は行わず、
        ダイアログ展開中に変更があった場合リアルタイムで再生成する
        とりあえずは常時リアルタイムダイアログ生成で実装
        */
        this.CanvasIDDataTypeMap=ReceivedDataBody.get("CanvasIDDataTypeMap");
        this.LayoutGridMap=ReceivedDataBody.get("LayoutGridMap");
        this.GridNumber2CanvasIDArray=ReceivedDataBody.get("GridNumber2CanvasIDArray");
        this.CanvasID2GridNumberMap=ReceivedDataBody.get("CanvasID2GridNumberMap");
        /*各要素に値を突っ込んでいく*/
        //関数選択機能の設定
        //評価関数の登録
        this.EvaluationFunctionMap=new Map([
            [VolumetricDSC.EvaluateName,new VolumetricDSC()],
            [SurfaceDice.EvaluateName,new SurfaceDice()],
            [HausdorffDistance95.EvaluateName,new HausdorffDistance95()],
            [HausdorffDistance100.EvaluateName,new HausdorffDistance100()],
        ]);
        //関数セレクト周辺への反映
        this.EvaluationFunctionSelecter.innerHTML="";
        for(const [EvaluateName,EvaluationInstance] of this.EvaluationFunctionMap.entries()){
            const option=document.createElement("option");
            option.value=EvaluateName;
            const OptionText=`${EvaluateName} [ ${EvaluationInstance.TargetDataTypeText} ]`;
            option.text=OptionText;
            this.EvaluationFunctionSelecter.appendChild(option);
        }
        //一番最初に追加した要素をデフォルト選択とする
        this.EvaluationFunctionSelecter.selectedIndex=0;
        //一応一つ前の評価関数名を保持しておく
        this.CurrentSelectedFunctionName=false;
        //OFFにする時に必要になる
        //その他でも必要になることになったので、Selecterの選択変化時にCanvasID,Layer=DataType,DataIDを保持させる
        //CIDとターゲットレイヤーをセットで保持する
        //[{"CanvasID":CanvasID,"DataType":DataType,"DataID":DataID},...,]の形式のように、Mapの配列とする。DataType=Layerでもある。可変長入力に対応するため
        //{CanvasID:{DataType:DataID,DataType:DataID},...}みたいな形式にする
        this.CurrentSelectedCanvasIDSet=new Set();//どのCanvasIDが選択されたかを保持しておくSet
        //評価関数にどのCanvasIDがどのデータを指しているかを示すためのデータ
        //Calculateが押されたときに、評価関数にCanvasIDと読み込まれているデータを渡し、そちら側で作った同形式のものを格納する
        this.InputCanvasIDDataTypeDataIDMap=new Map();
        
        this.VolumeStock=new Map();//KeyはDataType:DataIDとする
        this.originalimagewidth=99999;
        this.originalimageheight=99999;
        this.originalslidermax=99999;
        this.UpdateInputSelectDialog();//まずはダイアログを作成する。
        console.log("ダイアログの初期化完了");
        this.ChangeFunctionSelect();
        console.log("評価関数の初期設定完了");
        //イベントの登録
        this.ElementsWithEvents=new Map();
        this.setUserEvents();
        console.log("ユーザー用イベント設定完了");
        this.setSubWindowCloseEvents();
    }
    setUserEvents(){
        this.FromMainProcessToSubFunctions=new Map();
        //評価指標選択
        this.EventSetHelper(this.EvaluationFunctionSelecter,"change",(e)=>{
            //const SelectedFunctionName=e.target.value;
            this.ChangeFunctionSelect();
        });
        /*CanvasSelectInputDialogOpen*/
        this.EventSetHelper(this.InputSelectDialogOpenButton,"mouseup",(e)=>{
            if(e.button===0){
                this.InputSelectDialog.showModal();
            }
        });
        this.EventSetHelper(this.InputSelectDialogCloseButton,"mouseup",(e)=>{
            if(e.button===0){
                this.InputSelectDialog.close();
            }
        });
        this.EventSetHelper(this.InputSelectDialog,"close",()=>{//ダイアログが閉じられたときの処理
            //選択されたCanvasIDを送信する
            this.SendTargetCanvasChange();
            //計算開始条件を満たしているかチェック
            this.CheckCalculatable();
        });
        this.EventSetHelper(this.CanvasSelectButtonContainer,"mouseup",(e)=>{
            if(e.button===0){
                if(e.target.tagName==="BUTTON"){
                    const CanvasButton=e.target;
                    //Select状態の切り替え
                    const CanvasID=parseInt(CanvasButton.value);
                    if(CanvasButton.classList.contains("Selected")){//選択されているものをクリックした⇒選択解除
                        CanvasButton.classList.remove("Selected");
                        this.CurrentSelectedCanvasIDSet.delete(CanvasID);
                    }else{//選択されていないものをクリックした⇒選択
                        CanvasButton.classList.add("Selected");
                        //CurrentSelectedCanvasIDSetを更新
                        //const DataType=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName).TargetDataType;
                        //const DataID=this.CanvasIDDataTypeMap.get(CanvasID).get(DataType);
                        this.CurrentSelectedCanvasIDSet.add(CanvasID);//{CanvasID:{DataType:???,DataID:???}}
                    }
                }
            }
        })
        //インプットの変更をMainWindowに通知後、あちらからサイズに関する情報が送られてくるので受け取る
        const FromMainToSubCanvasSizeFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const originalimagewidth=ReceivedDataBody.get("originalimagewidth");
            const originalimageheight=ReceivedDataBody.get("originalimageheight");
            const originalslidermax=ReceivedDataBody.get("originalslidermax");
            //それぞれと現在の境界値を比較して、内側のものを採用する
            const widthmax=Math.min(this.originalimagewidth,originalimagewidth);
            const heightmax=Math.min(this.originalimageheight,originalimageheight);
            const slidermax=Math.min(this.originalslidermax,originalslidermax);
            this.LeftTopXInput.max=widthmax;
            this.LeftTopYInput.max=heightmax;
            this.RectangleWidthInput.max=widthmax;
            this.RectangleHeightInput.max=heightmax;
            this.StartSliceInput.max=slidermax;
            this.EndSliceInput.max=slidermax;
            this.originalimagewidth=widthmax;
            this.originalimageheight=heightmax;
            this.originalslidermax=slidermax;
        }
        this.FromMainProcessToSubFunctions.set("FromMainToSubCanvasSize",FromMainToSubCanvasSizeFunction);
        //範囲選択
        for(const element of [this.LeftTopXInput,this.LeftTopYInput,this.RectangleWidthInput,this.RectangleHeightInput,this.StartSliceInput,this.EndSliceInput]){
            this.EventSetHelper(element,"keydown",(e)=>{
                if(e.code==="Enter"){
                    this.SelectedAreaChange();
                    //セレクトエリアの変更を通知
                }
            });
            this.EventSetHelper(element,"focus",()=>{
                element.select();
            });
            this.EventSetHelper(element,"blur",()=>{
                this.SelectedAreaChange();
            });
        }
        const ChangeSelectedAreaFunction=(data)=>{
            console.log("ChangeSelectedArea");
            const ReceivedDataBody=data.get("data");
            const SelectedAreaData=ReceivedDataBody.get("SelectedArea");
            this.LeftTopXInput.value=SelectedAreaData.get("w0");
            this.LeftTopYInput.value=SelectedAreaData.get("h0");
            this.RectangleWidthInput.value=SelectedAreaData.get("width");
            this.RectangleHeightInput.value=SelectedAreaData.get("height");
            this.StartSliceInput.value=SelectedAreaData.get("startslice");
            this.EndSliceInput.value=SelectedAreaData.get("endslice");
            //MainWindowから変更を受け取ったら、現在選択中のCanvasにも伝える
            this.SendSelectedArea();
        }
        this.FromMainProcessToSubFunctions.set("ChangeSelectedArea",ChangeSelectedAreaFunction);
        /*評価指標計算*/
        //1.計算開始ボタン→データ要求
        this.CalculateID=0;
        /*
        this.DataLoadStatus=new Map([
            ["NoLoad",[]],//DataType:DataIDという文字列が入る
            ["Load",[]]
        ]);
        */
        this.EventSetHelper(this.CalculateConfirmButton,"mouseup",(e)=>{
            if(e.button==0){
                //console.log("計算開始");
                //要求されているCIDと現在ストックされているCIDを調査
                //ストックはMainWindowからデータをもらった時に上書きされる
                //とりあえず選択されている関数の入力数を気にせずやってみる
                //this.DataLoadStatus.set("NoLoad",[]);
                //this.DataLoadStatus.set("Load",[]);
                //const NoLoadDataArray=this.DataLoadStatus.get("NoLoad");
                //const LoadDataArray=this.DataLoadStatus.get("Load");
                //const CurrentStockedDataArray=Array.from(this.VolumeStock.keys());
                const NoLoadDataKeySet=new Set();
                const LoadDataKeySet=new Set();
                const CurrentStockedDataKeySet=new Set(this.VolumeStock.keys());
                const SelectedFunction=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName);
                /*
                評価関数側にCanvasIDを渡して必要なDataType,DataIDのリストを作成させる
                CurrentSelectedCanvasIDSetのCanvasIDと、そこに現在読み込まれているものを見て(CanvasIDDataTypeMap=現在のメインウィンドウのデータとCanvasIDの関係をまとめたMap)、
                自分たちの動作に必要なDataTypeを確認し、そのDataIDもろもろをまとめたモノを返す{DataType:DataID,DataType:DataID}を返すようにする
                CurrentSelectedCanvasIDSetをまとめて渡して、Setの要素をkeyとするMapを戻させるようにする。ダイアログのSelect時にやっていたことを計算が確定してからやる
                */
                /*
                InputCanvasIDDataTypeDataIDMapの構造
                {
                    CanvasID:{
                        DataType:DataID,
                        DataType:DataID,
                    },
                    CanvasID:{
                    
                    }
                }
                */
                this.InputCanvasIDDataTypeDataIDMap=SelectedFunction.OrderNecessaryData(this.CurrentSelectedCanvasIDSet,this.CanvasIDDataTypeMap);
                /*
                for(const CurrentSelectedCanvasIDSet of this.CurrentSelectedCanvasIDSet.values()){
                    const DataType=CurrentSelectedCanvasIDSet.get("DataType");
                    const DataID=CurrentSelectedCanvasIDSet.get("DataID");
                    const DataTypeDataIDString=Evaluate.Array2String([DataType,DataID]);//VolumeStockでは集合による存在判定を行っているため、一意に決まる文字列を生成する
                    if(CurrentStockedDataList.includes(DataTypeDataIDString)){
                        NoLoadDataList.push(DataTypeDataIDString);
                    }else{
                        //ストックにないので読み込みが必要
                        LoadDataList.push(DataTypeDataIDString);
                        //仮想的に読み込まれた状態にする
                        CurrentStockedDataList.push(DataTypeDataIDString);
                    }
                }
                */
                for(const InputDataTypeDataIDMap of this.InputCanvasIDDataTypeDataIDMap.values()){//{DataType:DataID,...}を受け取る
                    for(const [DataType,DataID] of InputDataTypeDataIDMap.entries()){
                        const DataTypeDataIDString=this.constructor.Array2String([DataType,DataID]);
                        if(CurrentStockedDataKeySet.has(DataTypeDataIDString)){
                            NoLoadDataKeySet.add(DataTypeDataIDString);
                        }else{
                            //ストックにないので読み込みが必要
                            LoadDataKeySet.add(DataTypeDataIDString);
                            CurrentStockedDataKeySet.add(DataTypeDataIDString);
                        }
                    }
                }
                //最終的に必要となるデータはNoloadDataListとloadDataListの個数となり、これらのデータのみをストック対象とする
                //現在のStockにあるデータのうち、NoloadDataListにないストックは消す
                //不要なストックの削除はLoadDataListが0でも行う必要がある。可変長引数で大量にデータを読み込んだ時、何かしらのストックで済む可能性が高い
                //そのとき、LoadDataListがない場合にストックの削除を行わないとすると、いつまでも大量のデータがストックされた状態になる
                //const NoLoadDataSet=new Set(NoLoadDataList);
                //const CurrentStockedDataSet=new Set(CurrentStockedDataList);
                const DeleteTargetDataList=[...CurrentStockedDataKeySet].filter(dtypedataidString=>(!NoLoadDataKeySet.has(dtypedataidString)));//ストックされている奴の中で、NoLoadedにないものは消す＝完全に計算に関与しないもの
                //ストックを削除
                for(const DeleteTargetData of DeleteTargetDataList){
                    this.VolumeStock.delete(DeleteTargetData);//ストックされているデータのうち、今回の計算で使わないものは削除される。
                }
                /*
                if(LoadDataList.length>0){
                    const LoadNoLoadUnionDataSet=new Set(NoLoadDataList.concat(LoadDataList));
                    const CurrentStockedDataSet=new Set(CurrentStockedDataList);//ないとは思うが一応重複を消す
                    //CurrentStockedCIDSetのみにあり、LoadNoLoadUnionCIDsetにはないCIDのストックを削除する
                    const DelateTargetDataList=[...CurrentStockedDataSet].filter(dtypedid=>(!LoadNoLoadUnionDataSet.has(dtypedid)));
                    const DelateNum=LoadDataList.length;//LoadListは重複が起きないはず
                    //ストックを削除
                    for(let i=0;i<DelateNum;i++){
                        const DelateTargetData=DelateTargetDataList[i];//"DataType:DataID"の文字列キー
                        this.VolumeStock.delete(DelateTargetData);
                    }
                }
                */
                //MainWindowにLoadDataListのデータを要求
                /*
                LoadDataListが空の配列のとき、
                MainWindow側は何のデータタイプに対して評価が行われるかわからず
                データタイプごとに共通で必要となるデータを送れない(例えばMaskLabelとか)。
                そこで、DataTypeも別で送ることにする
                */
                const TargetDataTypeArray=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName).TargetDataTypeArray;
                this.SendTargetDataList(TargetDataTypeArray,LoadDataKeySet);//ラッパー
            }
        });
        //2.データ受け取り→計算
        //listitemをフォーカスしたときにデータの送信が起こるが、なるべく無用な送信は控えたいので新しく計算した結果に自動フォーカスするときは送信が起こらないようにFlagで管理する
        //this.ListItemClickedTransmission=false;
        const FromMainToSubTargetVolumeFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const VolumeMap=ReceivedDataBody.get("VolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}
            const ExtraDataMap=ReceivedDataBody.get("ExtraDataMap");
            //SelectArea, input順のvolume, を関数に送る
            //console.log("イメージボリューム受信");
            //console.log(Array.from(VolumeMap.keys()));
            //VolumeStockに格納する
            for(const [datakey,volumemap] of VolumeMap.entries()){
                //datakey="DataType:DataID"
                this.VolumeStock.set(datakey,volumemap);//volumemapは{datakey:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}
            }
            /*
            評価関数に渡す用のデータを成形
            評価指標のパラメータをチェックし、Inputとして選択されたデータをどのように区切って渡すか決める
            基本的には1つずつをN回計算するか、N個セットで１回計算するかのどちらかであるが、それを意識してコーディングする必要はない。

            CanvasInputRequiredNum=N;//条件に合うCanvasを２つ入力する必要がある
            CalculateRepetitionsNum=1or∞;//一度Calculateが押されたときに何回評価を行うかの上限＝最終的にCalculateIDがどれだけ増加するか

            これとInputCanvasIDDataTypeDataIDMapのサイズを見ながらデータを分割して評価関数に渡す。
            基本的に、個数に従ってCanvasIDMapを抽出⇒これに合致するVolumeをStockから抽出⇒成形して送信という流れ
            */
            const EvaluationFunctionName=this.CurrentSelectedFunctionName;
            const EvaluationFunction=this.EvaluationFunctionMap.get(EvaluationFunctionName);
            //const InputBlockSelecterList=Array.from(this.InputBlockSelecterMap.values());
            //const CurrentInputInfoList=Array.from(this.CurrentSelectedCanvasIDSet.values());//{CanvasID,Layer,DataID}のMapのリスト
            //const InputInfoList=[];
            //SelectedAreaの成形
            const SelectedArea=new Map([
                ["w0",parseInt(this.LeftTopXInput.value)],
                ["h0",parseInt(this.LeftTopYInput.value)],
                ["width",parseInt(this.RectangleWidthInput.value)],
                ["height",parseInt(this.RectangleHeightInput.value)],
                ["startslice",parseInt(this.StartSliceInput.value)],
                ["endslice",parseInt(this.EndSliceInput.value)],
            ]);
            const CanvasInputRequiredNum=EvaluationFunction.CanvasInputRequiredNum;//一度に必要とするCanvasIDの個数
            const CalculateRepetitionsNum=this.InputCanvasIDDataTypeDataIDMap.size/CanvasInputRequiredNum;//何回分の計算を行うか
            //CanvasIDは選択した順番を保持しているので、基本的には順番に取り出していく
            const InputCanvasIDArray=Array.from(this.InputCanvasIDDataTypeDataIDMap.keys());
            for(let CalculateRepetitions=0;CalculateRepetitions<CalculateRepetitionsNum;CalculateRepetitions++){
                const HistoryCanvasIDArray=[];//履歴用
                const InputVolumeMap=new Map();
                const SelectedCanvasInfoMap=new Map();//{CanvasID:{DataType:DataID,...,},...,}
                for(let CanvasInputRequired=0;CanvasInputRequired<CanvasInputRequiredNum;CanvasInputRequired++){
                    const CanvasIDIndex=CalculateRepetitions*CanvasInputRequiredNum+CanvasInputRequired;
                    const InputCanvasID=InputCanvasIDArray[CanvasIDIndex];
                    //履歴に表示するための配列にCanvasIDをpush
                    HistoryCanvasIDArray.push(InputCanvasID);
                    const InputDataTypeDataIDMap=this.InputCanvasIDDataTypeDataIDMap.get(InputCanvasID);//{DataType:DataID,...,}
                    //評価関数に送るCanvasIDがどのデータを指すかのMapにこのCanvasIDの情報を追加
                    SelectedCanvasInfoMap.set(InputCanvasID,InputDataTypeDataIDMap);
                    //VolumeMapKeyを作成して計算に使うVolumeデータをストックから抽出
                    for(const [DataType,DataID] of InputDataTypeDataIDMap.entries()){
                        const InputVolumeMapKey=this.constructor.Array2String([DataType,DataID]);
                        InputVolumeMap.set(InputVolumeMapKey,this.VolumeStock.get(InputVolumeMapKey));
                    }
                }
                const CalculateID=this.CalculateID;
                this.CalculateID++;
                const CalculateData=new Map([
                    ["CalculateID",CalculateID],
                    ["SelectedArea",SelectedArea],
                    ["SelectedCanvasInfoMap",SelectedCanvasInfoMap],//{CanvasID:{DataType:DataID,...,},...,}
                    ["InputVolumeMap",InputVolumeMap],//実際に必要になるボリュームを送る。複数のセレクターが同じものを選択した場合、個数はセレクターよりも少なくなる
                    ["ExtraDataMap",ExtraDataMap],
                ]);
                EvaluationFunction.Calculate(CalculateData);
                //CalculateHistoryListに要素を追加
                const ListItem=document.createElement("li");
                ListItem.className="CalculateHistoryListItem";
                ListItem.setAttribute("data-FunctionName",EvaluationFunctionName);
                ListItem.setAttribute("data-CalculateID",CalculateID);
                const ListItemFragment=document.createDocumentFragment();
                //CalculateID, FunctionName, Input名を表示する
                const CalculateIDArea=document.createElement("div");
                CalculateIDArea.className="CalculateHistoryListItemIDArea";
                CalculateIDArea.textContent=CalculateID;
                const FunctionNameArea=document.createElement("div");
                FunctionNameArea.className="CalculateHistoryListItemFunctionNameArea";
                FunctionNameArea.textContent=EvaluationFunctionName;
                const InputCIDArea=document.createElement("div");
                InputCIDArea.className="CalculateHistoryListItemInputCIDArea";
                InputCIDArea.textContent=`[ ${HistoryCanvasIDArray.join(",")} ]`;
                ListItemFragment.appendChild(CalculateIDArea);
                ListItemFragment.appendChild(FunctionNameArea);
                ListItemFragment.appendChild(InputCIDArea);
                ListItem.appendChild(ListItemFragment);
                this.CalculateHistoryList.appendChild(ListItem);
            }
            //追加したリストアイテムにFocusを当てて結果を表示する
            const scrollHeight=this.CalculateHistoryList.scrollHeight;
            this.CalculateHistoryList.scrollTop=scrollHeight;
            //ここでのFocusでは送信を起こしたくない
            this.FocusHistoryListItem(this.CalculateID-1,false);
        }
        this.FromMainProcessToSubFunctions.set("FromMainToSubTargetVolume",FromMainToSubTargetVolumeFunction);
        //ulに対してイベントを定義
        this.PreviousSelectedCalculateID=null;
        this.EventSetHelper(this.CalculateHistoryList,"click",(e)=>{
            if(e.target.tagName==="LI"){//リストアイテムがクリックされたら
                //ここでのFocusでは送信を起こす必要がある
                const NewCalculateID=parseInt(e.target.getAttribute("data-CalculateID"));
                this.FocusHistoryListItem(NewCalculateID,true);
            }
        });
        const UpdateMainWindowStatusFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            this.CanvasIDDataTypeMap=ReceivedDataBody.get("CanvasIDDataTypeMap");
            this.LayoutGridMap=ReceivedDataBody.get("LayoutGridMap");
            this.CanvasID2GridNumberMap=ReceivedDataBody.get("CanvasID2GridNumberMap");
            this.GridNumber2CanvasIDArray=ReceivedDataBody.get("GridNumber2CanvasIDArray");
            this.UpdateInputSelectDialog();//MaiWindowの配置を再現
            this.ChangeCanvasButtonSelectable();//選択可能状態を制御
            this.SyncroInputSelect();//選択状態を復元＆ないCanvasIDを除外
        }
        this.FromMainProcessToSubFunctions.set("UpdateMainWindowStatus",UpdateMainWindowStatusFunction);
    }
    FocusHistoryListItem(NewCalculateID,transmission=true){
        if(true||NewCalculateID!==this.PreviousSelectedCalculateID){
            //PreviouseSelectedCIDを更新
            this.PreviousSelectedCalculateID=NewCalculateID;
            const LiChildren=this.CalculateHistoryList.children;
            for(const lich of LiChildren){
                lich.classList.remove("Selected");
            }
            const selectedListItem=this.CalculateHistoryList.querySelector(`:scope > li[data-CalculateID="${NewCalculateID}"]`);
            selectedListItem.classList.add("Selected");
            const FunctionName=selectedListItem.getAttribute("data-FunctionName");
            const CalculateID=NewCalculateID;
            const SelectedFunction=this.EvaluationFunctionMap.get(FunctionName);
            //console.log("CH",SelectedFunction.CalculateHistory);
            //console.log("ID",CalculateID);
            //const map1=Array.from(SelectedFunction.CalculateHistory.keys());
            //console.log(typeof(map1[0]),map1[0]);
            //console.log(typeof(CalculateID),CalculateID);
            const history=SelectedFunction.CalculateHistory.get(CalculateID);
            const SelectedAreaData=history.get("SelectedArea");
            const SelectedCanvasInfoMap=history.get("SelectedCanvasInfoMap");//{CanvasID:{DataType:DataID}}
            //const InputVolumeKeyPathMap=history.get("InputVolumeKeyPathMap");
            //console.log(SelectArea);
            //console.log(InputCIDList);
            /*選択した履歴の情報を反映する*/
            /*
            新しく計算したタイミングでは、入力欄やOPモード対象を切り替える必要がない
            入力欄を切り替える必要があるのは、過去の結果を参照したいとき＝listitemがクリックされたとき
            ただし、結果表示欄は必ず切り替える必要がある。
            */
            if(transmission){
                //1. 選択した関数にする
                this.EvaluationFunctionSelecter.value=FunctionName;
                //this.EvaluationFunctionSelecter.dispatchEvent(new Event("change"));
                this.ChangeFunctionSelect();
                //2. 計算時のCanvasIDの選択の復元を試みる
                const CalculatedCanvasIDSet=new Set(SelectedCanvasInfoMap.keys());
                this.CurrentSelectedCanvasIDSet=CalculatedCanvasIDSet;
                this.SyncroInputSelect();
                this.SendTargetCanvasChange();
                //評価時に有効だった入力個数分だけ順番に変更する
                /*
                const InputBlockSelecterList=Array.from(this.InputBlockSelecterMap.values());//indexでアクセスするため
                for(let i=0;i<InputInfoList.length;i++){
                    const InputInfo=InputInfoList[i];
                    const InputCID=InputInfo.get("CanvasID");
                    const ChangeTargetCIDSelecter=InputBlockSelecterList[i];
                    ChangeTargetCIDSelecter.value=InputCID;
                    ChangeTargetCIDSelecter.dispatchEvent(new Event("change"));
                }
                */
                //3. SelectedAreaを反映
                this.LeftTopXInput.value=SelectedAreaData.get("w0");
                this.LeftTopYInput.value=SelectedAreaData.get("h0");
                this.RectangleWidthInput.value=SelectedAreaData.get("width");
                this.RectangleHeightInput.value=SelectedAreaData.get("height");
                this.StartSliceInput.value=SelectedAreaData.get("startslice");
                this.EndSliceInput.value=SelectedAreaData.get("endslice");
                this.SendSelectedArea();
            }
            /*
            Focusした履歴の結果を表示する
            表示形式、表示対象となる履歴は各評価関数に設計を任せる
            */
            //console.log("最新結果を表示");
            //console.log("ここまでいったよ");
            const ResultDomTree=SelectedFunction.FocusResult(CalculateID);//イベント設定用にthisも渡す
            this.ResultContainer.innerHTML="";
            this.ResultContainer.appendChild(ResultDomTree);
        }
    }
    /*
    FocusHistoryListItemFromOut(CalculateID){
        //表示している結果をクリックした際にこちらに飛ばすことを想定したメソッド
        //プログラムからリストアイテムクリックを起こす
        //リストアイテムとCalculateIDは同時に増減するはずなのでそのまま子要素のインデックスになってるはず
        //data-CalculateID属性にCalculateIDがあるので、これと引数が一致するもので検索すればさらに確実
        const targetListItem=this.CalculateHistoryList.querySelector(`:scope > li[data-CalculateID="${CalculateID}"]`);
        const clickEvent=new MouseEvent("click",{
            bubbles:true,
            cancelable:true
        });
        targetListItem.dispatchEvent(clickEvent);
    }
    */
    ChangeFunctionSelect(){
        //古い情報を保持(初回実行時などはないときもある)
        /*
        let OldSelectedFunctionName=this.CurrentSelectedFunctionName;
        let OldSelectedFunction=false;
        let OldTargetDataType=false
        //let OldInputNum=false;
        if(OldSelectedFunctionName&&this.EvaluationFunctionMap.has(OldSelectedFunctionName)){
            OldSelectedFunction=this.EvaluationFunctionMap.get(OldSelectedFunctionName);
            OldTargetDataType=OldSelectedFunction.TargetDataType;
            //OldInputNum=OldSelectedFunction.InputNum;
        }
        //関数に関する情報と入力候補を変更する
        const NewSelectedFunctionName=this.EvaluationFunctionSelecter.value;
        const NewSelectedFunction=this.EvaluationFunctionMap.get(NewSelectedFunctionName);
        this.CurrentSelectedFunctionName=NewSelectedFunctionName;
        */
        /*
        InputSelectDialogの選択状態や選択可能状態の更新を行う
        入力数の変化による変更はこの時点では行わず、計算処理に映れないという制約をもってユーザーに通知する
        つまり、ターゲットデータタイプが変更された場合に限りChangeCanvasButtonSelectableを呼ぶ
        */
        /*
        const TargetDataTypeChangedFlag=(OldTargetDataType!==NewTargetDataType);
        //console.log(OldTargetDataType,NewTargetDataType,TargetDataTypeChangedFlag);
        if(TargetDataTypeChangedFlag){
            //新しく選択された保持しておく
            this.ResetInputSelect();//現在の選択をリセット
            this.ChangeCanvasButtonSelectable();//Disabledを更新して、適切なCanvasIDだけ選択できるようにする。
            this.SendTargetCanvasChange();//送信
        }
        */
        /*
        新しく選択された関数を記録
        必要な監視
        1．選択中のCanvasが減った⇒this.SendTargetCanvasChange();
        2. すべての選択が解除された⇒範囲選択リセット
        */
        this.CurrentSelectedFunctionName=this.EvaluationFunctionSelecter.value;//選択関数を変更
        //const NewSelectedFunction=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName);
        this.ChangeCanvasButtonSelectable();//新しく選択された関数で選べる状態に更新
        const [CanvasSelectChangedFlag,CanvasSelectResetFlag]=this.InheritCanvasButtonSelect();//もともとSelectされていたCanvasIDを見て、次の評価関数でもSelect状態のままでいられるか確認し、適宜CurrentSelectedCanvasIDSetを更新する。データタイプが全く合わない場合、結果的にリセットになる
        if(CanvasSelectChangedFlag){
            this.SendTargetCanvasChange();//Inputとして選択されたCanvasが変更されたので送信
        }
        //初期データから値をセット
        if(CanvasSelectResetFlag){//選択が初期化されたので選択範囲も初期化
            this.LeftTopXInput.value=0;
            this.LeftTopYInput.value=0;
            this.RectangleWidthInput.value=0;
            this.RectangleHeightInput.value=0;
            this.StartSliceInput.value=0;
            this.EndSliceInput.value=0;
            //各入力欄に最大値最小値を設定する
            this.originalimagewidth=99999;
            this.originalimageheight=99999;
            this.originalslidermax=99999;
            this.LeftTopXInput.min=0;
            this.LeftTopXInput.max=this.originalimagewidth;
            this.LeftTopXInput.step=1;
            this.LeftTopYInput.min=0;
            this.LeftTopYInput.max=this.originalimageheight;
            this.LeftTopYInput.step=1;
            this.RectangleWidthInput.min=0;
            this.RectangleWidthInput.max=this.originalimagewidth;
            this.RectangleHeightInput.step=1;
            this.RectangleHeightInput.min=0;
            this.RectangleHeightInput.max=this.originalimageheight;
            this.RectangleHeightInput.step=1;
            this.StartSliceInput.min=0;
            this.StartSliceInput.max=this.originalslidermax;
            this.StartSliceInput.step=1;
            this.EndSliceInput.min=0;
            this.EndSliceInput.max=this.originalslidermax;
            this.EndSliceInput.step=1;
        }
    }
    //ダイアログの状態管理に関する関数群
    /*
    MainWindowの状態を再現する関数(ダイアログの再構成)
    現在の評価指標が受け付けるデータイプをもとにボタンdisabledを制御する関数
    CurrentSelectedCanvasIDSetの選択状態をダイアログに反映する関数(CurrentSelectedCanvasIDSetの入力がその時点で焼失している可能性があり、それに対する処理も担当する)
    現在の選択状態をリセットする関数
    */
    UpdateInputSelectDialog(){
        /*
        現在読み込まれているデータとキャンバスの関係、配置を再現する
        */
        const RowsNum=this.LayoutGridMap.get("RowsNum");
        const ColumnsNum=this.LayoutGridMap.get("ColumnsNum");
        this.InputSelectDialog.style.setProperty("--CanvasSelectButtonGridRowsNum",RowsNum);
        this.InputSelectDialog.style.setProperty("--CanvasSelectButtonGridColumnsNum",ColumnsNum);
        this.CanvasSelectButtonContainer.innerHTML="";
        const CanvasSelectButtonContainerFragment=document.createDocumentFragment();
        /*
        CanvasID2GridNumberMapをもとに配置したボタンに属性を付与する
        ここではDataTypeの属性を付与し、querySelectorAllで容易に絞り込めるようにする
        */
        //console.log(this.GridNumber2CanvasIDArray);
        //console.log(this.CanvasIDDataTypeMap);
        for(let i=0;i<RowsNum*ColumnsNum;i++){
            const CanvasSelectButton=document.createElement("button");
            CanvasSelectButton.tabIndex="-1";//タブによるフォーカスの対象外とする
            const CanvasID=this.GridNumber2CanvasIDArray[i];
            if(CanvasID>=0){//この位置にCanvasが配置されている
                CanvasSelectButton.value=CanvasID;
                //DataTypeクラスを付与する
                const DataTypeMap=this.CanvasIDDataTypeMap.get(CanvasID);//{DataType:DataID,...,}
                for(const DataType of DataTypeMap.keys()){
                    CanvasSelectButton.classList.add(DataType);
                }
                CanvasSelectButton.textContent=`CanvasID : ${CanvasID}`;
            }
            CanvasSelectButtonContainerFragment.appendChild(CanvasSelectButton);
        }
        this.CanvasSelectButtonContainer.appendChild(CanvasSelectButtonContainerFragment);
    }
    ChangeCanvasButtonSelectable(){
        /*
        現在の評価関数で受け付けるデータタイプを確認し、ダイアログのボタンのdisabledを制御する
        */
        //データタイプが変わり、押せるCanvasButtonを更新する
        const EvaluationFunctionName=this.CurrentSelectedFunctionName;
        const EvaluationFunction=this.EvaluationFunctionMap.get(EvaluationFunctionName);
        const TargetDataTypeText=EvaluationFunction.TargetDataTypeText;
        const InputNumConditionText=EvaluationFunction.InputNumConditionText;
        //Dialog内の入力条件等のテキストを更新する
        this.TargetDataTypeDisplay.textContent=TargetDataTypeText;
        this.TargetInputNumDisplay.textContent=`N${InputNumConditionText}`;
        //CanvasSelectButtonContainer直下のボタンを一度すべて非表示にする
        this.CanvasSelectButtonContainer.querySelectorAll(":scope>button").forEach((button)=>{
            if(EvaluationFunction.CheckSelectable(button)){
                button.disabled=false;
                //console.log("disabled False");
            }else{
                button.disabled=true;
            }
        });
        //console.log("ChangeCanvasButtonSelectable");
    }
    SyncroInputSelect(){
        /*
        ダイアログの選択状態をCurrentSelectedCanvasIDSetに同期する
        このとき、要求されたCanvasIDが実際にはメインウィンドウにないこともあるためその場合はCurrentSelectedCanvasIDSetを更新する
        */
        const CanvasSelectButtonArray=this.CanvasSelectButtonContainer.querySelectorAll(":scope>button");
        const CanvasIDExistCheckSet=new Set(this.CurrentSelectedCanvasIDSet);//あれば消していく。最後に残っているCanvasIDがすでにMainWindowにないものになる
        for(const CanvasSelectButton of CanvasSelectButtonArray){
            const CanvasID=parseInt(CanvasSelectButton.value);
            //このCanvasIDが現在MainWindowに存在しているか
            if(this.CurrentSelectedCanvasIDSet.has(CanvasID)){
                CanvasSelectButton.classList.add("Selected");
                CanvasIDExistCheckSet.delete(CanvasID);
            }else{
                CanvasSelectButton.classList.remove("Selected");
            }
        }
        for(const DeleteTargetCanvasID of CanvasIDExistCheckSet){
            this.CurrentSelectedCanvasIDSet.delete(DeleteTargetCanvasID);
        }
        /*Select状態を変更するので計算可能かチェック*/
        this.CheckCalculatable();
    }
    InheritCanvasButtonSelect(){//Resetの拡張版
        //現在選択状態になっているCanvasIDに対して、CheckSelectableを実施し、選択可能状態じゃないCanvasIDを解除する
        //これはCheckSelectableに統合できるかもしれないが、無駄な計算が増える可能性があり、また、機能を併せ持つとコードが複雑に感じるので分離して実装する。ただし、分離するとループが過剰に回ることが懸念
        const CurrentSelectedFunction=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName);
        const SelectedButtonArray=this.CanvasSelectButtonContainer.querySelectorAll(":scope>button.Selected");
        let CanvasSelectChangedFlag=false;//選択状態が変わった⇒MainWindowに通知必要という印
        let ChangeCount=0;
        SelectedButtonArray.forEach((button)=>{
            if(!CurrentSelectedFunction.CheckSelectable(button)){
                //このCanvasIDは選択可能なものではないので、選択状態ではなくする
                button.classList.remove("Selected");
                this.CurrentSelectedCanvasIDSet.delete(CanvasID);
                CanvasSelectChangedFlag=true;
                ChangeCount++;
            }
        });
        const CanvasSelectResetFlag=(SelectedButtonArray.length===ChangeCount);//Selectedだったボタンの個数とSelectedを削除した個数が一致する＝すべてリセットされた
        //Select状態が変更されるので計算可能かチェック
        this.CheckCalculatable();
        return [CanvasSelectChangedFlag,CanvasSelectResetFlag];
    }
    /*
    ResetInputSelect(){
        //評価関数への入力をするために選択されている状態をリセットする
        //CurrentSelectedInfoMapをリセットする
        this.CurrentSelectedCanvasIDSet.clear();
        //Dialogの選択を解除する
        const SelectedCanvasButton=this.CanvasSelectButtonContainer.querySelectorAll(":scope>button.Selected");
        SelectedCanvasButton.forEach((button)=>{
            button.classList.remove("Selected");
        });
        //Select状態を変更するので計算可能かチェック
        this.CheckCalculatable();
    }
    */
    CheckCalculatable(){
        const CurrentSelectedCanvasNum=this.CurrentSelectedCanvasIDSet.size;
        const CurrentSelectedFunction=this.EvaluationFunctionMap.get(this.CurrentSelectedFunctionName);
        const CheckResult=CurrentSelectedFunction.CheckCalculatable(CurrentSelectedCanvasNum);
        this.CalculateConfirmButton.disabled=!CheckResult;//計算可能であればボタンの無効化を解除
    }
    SelectedAreaChange(){
        //範囲選択が画像の範囲を超えていないかチェックする
        //チェック順
        //1．サイズがオリジナル以上に設定されていないかチェック
        //2. チェック済みのサイズを基に左上の座標が0未満になっていないかチェック
        let w0=parseInt(this.LeftTopXInput.value);
        let h0=parseInt(this.LeftTopYInput.value);
        let width=parseInt(this.RectangleWidthInput.value);
        let height=parseInt(this.RectangleHeightInput.value);
        let startslice=parseInt(this.StartSliceInput.value);
        let endslice=parseInt(this.EndSliceInput.value);
        //console.log("Check",w0,h0,width,height,startslice,endslice);
        //サイズをチェック
        width=Math.max(0,Math.min(width,this.originalimagewidth));
        height=Math.max(0,Math.min(height,this.originalimageheight));
        //左上の座標をチェック
        w0=Math.max(0,Math.min(w0,this.originalimagewidth-width));
        h0=Math.max(0,Math.min(h0,this.originalimageheight-height));
        //スライスをチェック
        startslice=Math.max(0,Math.min(startslice,this.originalslidermax));
        endslice=Math.max(0,Math.min(endslice,this.originalslidermax));
        //console.log("Check",startslice,endslice);
        if(startslice>endslice){
            const temp=startslice;
            startslice=endslice;
            endslice=temp;
        }
        //値を更新
        this.LeftTopXInput.value=w0;
        this.LeftTopYInput.value=h0;
        this.RectangleWidthInput.value=width;
        this.RectangleHeightInput.value=height;
        //console.log("Check",startslice,endslice);
        this.StartSliceInput.value=startslice;
        this.EndSliceInput.value=endslice;
        //値を確定後、メインウィンドウに通知
        this.SendSelectedArea();//ラッパー。ここでは、選択されたCIDそれぞれにデータを送る
    }
    //現在選択状態にあるCanvasをメインウィンドウに通知し、それらだけをAreaSelectModeに変更する処理を行わせる
    SendTargetCanvasChange(){
        const TargetCanvasIDSet=this.CurrentSelectedCanvasIDSet;
        //console.log(Array.from(this.CurrentSelectedCanvasIDSet.keys()));
        //console.log(TargetCanvasIDSet);
        const SendingData=new Map([
            ["action","ChangeTargetCanvas"],
            ["data",new Map([
                ["TargetCanvasIDSet",TargetCanvasIDSet],
                ["SelectedArea",new Map([
                    ["w0",parseInt(this.LeftTopXInput.value)],
                    ["h0",parseInt(this.LeftTopYInput.value)],
                    ["width",parseInt(this.RectangleWidthInput.value)],
                    ["height",parseInt(this.RectangleHeightInput.value)],
                    ["startslice",parseInt(this.StartSliceInput.value)],
                    ["endslice",parseInt(this.EndSliceInput.value)]
                ])]
            ])]
        ]);
        this.PassChangesToMainWindow(SendingData);
    }
    /*
    SendTargetCanvasChange(OFFCIDLayerMap,ONCIDLayerMap){//ラッパー
        //適切なデータを形成して送る
        //const action="ChangeTargetCanvas";
        //LayerMapは{CanvasID,Layer,DataID}というMapになっている
        const TargetCID=new Map([
            ["ON",ONCIDLayerMap],
            ["OFF",OFFCIDLayerMap]
        ]);
        const SendingData=new Map([
            ["action","ChangeTargetCanvas"],
            ["data",new Map([
                ["TargetCID",TargetCID],
                ["SelectedArea",new Map([
                    ["w0",parseInt(this.LeftTopXInput.value)],
                    ["h0",parseInt(this.LeftTopYInput.value)],
                    ["width",parseInt(this.RectangleWidthInput.value)],
                    ["height",parseInt(this.RectangleHeightInput.value)],
                    ["startslice",parseInt(this.StartSliceInput.value)],
                    ["endslice",parseInt(this.EndSliceInput.value)]
                ])]
            ])]
        ]);
        this.PassChangesToMainWindow(SendingData);
    }
    */
    SendSelectedArea(){//ラッパー
        const SelectedArea=new Map([
            ["w0",parseInt(this.LeftTopXInput.value)],
            ["h0",parseInt(this.LeftTopYInput.value)],
            ["width",parseInt(this.RectangleWidthInput.value)],
            ["height",parseInt(this.RectangleHeightInput.value)],
            ["startslice",parseInt(this.StartSliceInput.value)],
            ["endslice",parseInt(this.EndSliceInput.value)],
        ]);
        for(const CanvasID of this.CurrentSelectedCanvasIDSet){
            //const targetCID=CIDLayerMap.get("CanvasID");
            if(CanvasID>=0){//未選択CIDは-99999
                //そのうち変更を加えたキャンバス自身にはこの変更を送らないようにするかも
                //ただし、送信回数が一回減るだけなので、送信の負荷がそこまで大きくないならその変更はいらないかも
                const SendingData=new Map([
                    ["action","ChangeCanvasesSelectedArea"],
                    ["data",new Map([
                        ["targetCID",CanvasID],
                        ["SelectedArea",SelectedArea]
                    ])]
                ])
                this.PassChangesToMainWindow(SendingData);
            }
        }
    }
    SendTargetDataList(TargetDataTypeArray,LoadDataKeySet){//ラッパー
        const SendingData=new Map([
            ["action","EvaluateStart"],
            ["data",new Map([
                ["TargetDataTypeArray",TargetDataTypeArray],
                ["LoadDataKeySet",LoadDataKeySet],
            ])]
        ])
        //console.log(TargetCIDList);
        this.PassChangesToMainWindow(SendingData);
    }
    PassChangesToMainWindow(data){
        window.SubWindowMainProcessAPI.FromSubToMainProcess(data);
    }
    ReceiveChangesFromMainWindow(data){
        const bodyaction=data.get("action");
        //console.log(bodyaction);
        this.FromMainProcessToSubFunctions.get(bodyaction)(data);
    }
    setSubWindowCloseEvents(){
        console.log("終了処理登録");
        //選択されているCanvasのOPモードを無効化する
        window.SubWindowMainProcessAPI.CloseSubWindowFromMainProcessToSub((event,ReceiveData)=>{
            console.log("SubWindow終了準備");
            const SendDataList=[];
            //AreaSelectModeを解除
            for(const CanvasID of this.CurrentSelectedCanvasIDSet){
                //有効なCIDが選択されているものだけ送信する
                //const CanvasID=CIDLayerMap.get("CanvasID");
                if(CanvasID>=0){//未選択状態のものは送らない
                    const SendingData=new Map([
                        ["action","AreaSelectModeSwitching"],
                        ["data",new Map([
                            ["Activate",false],
                            ["CanvasID",CanvasID]
                        ])]
                    ]);
                    SendDataList.push(SendingData);
                    //この下でレイヤー注目解除のデータを作ったりする
                }
            }
            window.SubWindowMainProcessAPI.CloseSubWindowFromSubToMainProcess(SendDataList);
        });
    }
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
            console.log(`EventSettingError\n${error}`);
        }
    }
}

/*
----------------------------------------------------------------------------------
ここから評価指標定義エリア 
----------------------------------------------------------------------------------
*/

/*
評価指標クラスが持っていなければならない情報
・自身の表示名
・対象とするデータタイプ
・自身の入力個数
・計算方法
・結果表示の際のテンプレート
*/
/*
関数の計算部分には
ターゲットとなる３Dボリューム(flatten)と、選択範囲が渡される。
評価関数によってflattenしてから計算できるものとそうでないものがあるため、関数の中で所望する形状に再形成したうえで計算を行う
*/

class VolumetricDSC{
    static EvaluateName="VolumetricDSC";
    constructor(){
        //名前。基本的には自身のクラス名を名前とする
        //this.EvaluatonName=this.constructor.name
        //this.InputNum=2;
        //this.TargetDataType="MASK";
        this.TargetDataTypeArray=["MASK"].sort();
        this.TargetDataTypeText=`${this.TargetDataTypeArray.join(", ")}`;
        //this.InputNum=2;//可変数の入力を受け付ける関数は下限値、上限値などの境界値を表す変数とする。
        //this.InputNumConditionText=`=${this.InputNum}`;//可変長の場合は>=1のようにする。この条件はInputNumConditionCheckで表現する
        /*Canvasの入力数に関するパラメータ*/
        this.CanvasInputRequiredNum=2;//条件に合うCanvasを２つ入力する必要がある
        this.CalculateRepetitionsNum=1;//一度Calculateが押されたときに何回評価を行うか＝最終的にCalculateIDがどれだけ増加するか
        this.CalculatableSelectNum=this.CanvasInputRequiredNum*this.CalculateRepetitionsNum;//選択数がこれと一致する時なのか、これ以下のときなのかは関数による
        this.InputNumConditionText=`=${this.CalculatableSelectNum}`;
        this.CalculateHistory=new Map();//{ID:{Result,SelectedArea}}
        this.setResultTemplate();
        this.setUserEvents();
    }
    /*どの関数でも必要*/
    //与えられたCanvasButtonのクラス＝読み込んであるデータタイプをチェックして、この関数への入力として選択できるキャンバスであるかチェックする
    CheckSelectable(CanvasButtonElement){//ButtonElementに付与されているデータタイプを見てこのCanvasIDが選択可能か判定する
        let ButtonSelectableFlag=true;
        for(const TargetDataType of this.TargetDataTypeArray){
            ButtonSelectableFlag=ButtonSelectableFlag&&CanvasButtonElement.classList.contains(TargetDataType);
        }
        return ButtonSelectableFlag;
    }
    /*どの関数でも必要*/
    //この評価関数が受け付ける入力数の条件をチェックしてtrueかfalseで返す。これはすべての評価関数でもたなければならない
    CheckCalculatable(InputNum){
        //この評価関数は入力数2のときに計算可能である。
        if(InputNum===this.CalculatableSelectNum){
            return true;
        }else{
            return false;
        }
    }
    /*
    選択されたCanvasIDに読み込まれているデータタイプをチェックして、Evaluateに要求するデータを申請するメソッド
    評価指標によっては、MASKとDOSEを同一キャンバスにオーバーレイした状態で、１つを選択⇒そこに読み込まれているこれらを送信させる、というように従来の仕様の枠をはみ出した動きが必要になるので
    評価関数ごとの専用実装部分とすることにした
    */
    OrderNecessaryData(CurrentSelectedCanvasIDSet,CanvasIDDataTypeMap){//[{CanvasID:{Mask:DataID,CT:DataID,...}},{CanvasID:{}}]のような形式で送られてくるはず
        /*
        CurrentSelectedCanvasIDSetは選択されたCanvasID、CanvasIDDataTypeMapはメインウィンドウのデータ読み込み状況
        例：以下の出力形式の意味
        {
            0:{
                CT:1,
                MASK:2
            }
        }
        CurrentSelectedCanvasIDSetにはCanvsID：0が格納されており、CanvasID＝0のキャンバスで表示しているデータを評価することを示す
        このキャンバスに表示されているデータのうち、どのデータタイプを使うかは評価関数の側で自由に決める。この例では、キャンバス0で表示しているCTとMASKのデータを評価のために必要としており
        、そのCTデータはDataType＝CT、DataID(DataTypeごとの識別番号＝通し番号、何番目に読み込まれたCTデータか)＝1のデータを必要としている。MASKの2を必要としている。
        */
        const OrderCanvasIDDataTypeDataIDMap=new Map();
        for(const CanvasID of CurrentSelectedCanvasIDSet){
            const CanvasIDMap=new Map();
            const SelectedCanvasIDDataTypeDataIDMap=CanvasIDDataTypeMap.get(CanvasID);
            /*この評価関数では、MASKのみを使用する*/
            for(const TargetDataType of this.TargetDataTypeArray){
                const DataID=SelectedCanvasIDDataTypeDataIDMap.get(TargetDataType);
                CanvasIDMap.set(TargetDataType,DataID);
            }
            OrderCanvasIDDataTypeDataIDMap.set(CanvasID,CanvasIDMap);
        }
        return OrderCanvasIDDataTypeDataIDMap;
    }
    setResultTemplate(){
        this.EvaluationTableForMaskResultContainer=document.createElement("div");
        this.EvaluationTableForMaskResultContainer.className="EvaluationTableForMaskResultContainer";
        /*InfoText部はテンプレートとして持っておく*/
        this.InfoTextContainer=document.createElement("div");
        this.InfoTextContainer.className="EvaluationTableForMaskInfoTextContainer";
        for(let i=0;i<this.CanvasInputRequiredNum;i++){
            const InfoText=document.createElement("div");
            InfoText.className="InfoText";
            this.InfoTextContainer.appendChild(InfoText);
        }
        //console.log(Array.from(this.InfoTextContainer.children));
        this.EvaluationTableForMaskResultContainer.appendChild(this.InfoTextContainer);
        /*tableの外枠だけは持っておく*/
        const ResultTableContainer=document.createElement("div");
        ResultTableContainer.className="EvaluationTableForMaskResultTableContainer";
        const ResultTable=document.createElement("table");
        ResultTable.className="EvaluationTableForMaskResultTable";
        this.TableHead=document.createElement("thead");
        this.TableHead.className="TableHead";
        this.TableBody=document.createElement("tbody");
        this.TableBody.className="TableBody";
        this.EvaluationTableForMaskResultContainer.appendChild(ResultTableContainer);
        ResultTableContainer.appendChild(ResultTable);
        ResultTable.appendChild(this.TableHead);
        ResultTable.appendChild(this.TableBody);
    }
    setUserEvents(){
        //console.log("VolumetricDSCからイベントを設定2");
        //console.log(this.TableBody);
        this.TableBody.addEventListener("click",(e)=>{
            //console.log("イベント発火");
            const TargetTR=e.target.closest("tr");
            if(TargetTR){
                const CalculateID=parseInt(TargetTR.getAttribute("data-CalculateID"));
                console.log(CalculateID);
                EvaluateObject.FocusHistoryListItem(CalculateID);
            }
        });
    }
    Calculate(CalculateData){
        /*
        SelectedAreaはどの関数でも共通の引数として、
        w0,h0,width,height,startslice,endsliceについて定めたMapとする
        */
        //console.log(CalculateData);
        const CalculateID=CalculateData.get("CalculateID");

        const SelectedArea=CalculateData.get("SelectedArea");
        const w0=SelectedArea.get("w0");
        const h0=SelectedArea.get("h0");
        const width=SelectedArea.get("width");
        const height=SelectedArea.get("height");
        const startslice=SelectedArea.get("startslice");
        const endslice=SelectedArea.get("endslice");

        const SelectedCanvasInfoMap=CalculateData.get("SelectedCanvasInfoMap");//{CanvasID:{DataType:DataID,...,},CanvasID:{DataType:DataID,...,}}
        //SelectedCanvasInfoMap={CanvasID:{DataType:???,DataID:???},...}
        const InputVolumeMap=CalculateData.get("InputVolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}をvalueとするMap
        //SelectedCanvasInfoMapからInputVolumeKeyArrayを作成する
        /*
        const InputVolumeKeyArray=Array.from(SelectedCanvasInfoMap.values()).map((DataTypeDataIDMap)=>{
            const DataType=DataTypeDataIDMap.get("DataType");
            const DataID=DataTypeDataIDMap.get("DataID");
            const InputVolumeKey=Evaluate.Array2String([DataType,DataID]);
            DataTypeDataIDMap.set("Path",InputVolumeMap.get(InputVolumeKey).get("Path"));
            return InputVolumeKey;
        });
        */
        const InputVolumeKeyArray=[];
        const InputVolumekeyPathMap=new Map();//入力されたCanvasIDと評価したデータのパスを保持しておく。
        const TargetDataType="MASK";//ここはconstructorと整合性をとること
        for(const [CanvasID,DataTypeDataIDMap] of SelectedCanvasInfoMap.entries()){
            const TargetDataID=DataTypeDataIDMap.get(TargetDataType);//DataID
            const InputVolumeKey=Evaluate.Array2String([TargetDataType,TargetDataID]);
            InputVolumeKeyArray.push(InputVolumeKey);
            InputVolumekeyPathMap.set(InputVolumeKey,InputVolumeMap.get(InputVolumeKey).get("Path"));
        }
        /*
        for(let i=0;i<InputInfoList.length;i++){
            InputInfoList[i].set("Path",InputVolumeMap.get(InputVolumeKeyArray[i]).get("Path"));
        }
        */
        //const PathTextList=[];//入力パスをまとめるもの

        const InputVolume1=InputVolumeMap.get(InputVolumeKeyArray[0]);
        const flattenvolume1=InputVolume1.get("Volume");
        const volume1OriginalWidth=InputVolume1.get("Size").get("width");
        const volume1OriginalHeight=InputVolume1.get("Size").get("height");
        //PathTextList.push(InputVolume1.get("Path"));

        const InputVolume2=InputVolumeMap.get(InputVolumeKeyArray[1]);
        const flattenvolume2=InputVolume2.get("Volume");
        const volume2OriginalWidth=InputVolume2.get("Size").get("width");
        const volume2OriginalHeight=InputVolume2.get("Size").get("height");
        //PathTextList.push(InputVolume2.get("Path"));
        
        const ExtraDataMap=CalculateData.get("ExtraDataMap");
        if(ExtraDataMap.has("ColorMapLabelArray")){//存在するときに新しく代入するよ
            this.ColorMapLabelList=ExtraDataMap.get("ColorMapLabelArray");//表示するときにこのラベルを使う
        }

        //この評価指標ではflattenされたものに対して計算を行う
        //const subarraysize=(endslice-startslice+1)*width*height;
        //const flattensubvolume1=new Float32Array(subarraysize);
        //const flattensubvolume2=new Float32Array(subarraysize);
        //flattenvolumeから指定された位置の要素だけ抽出しつつ、出現要素を調べる
        const EvaluationMap=new Map();
        /*
        MaskValue:{volume1:,volume2:,intersection:}
        */
        //let indexforpush=0;//subArrayに要素を詰めていくときに必要
        for(let z=startslice;z<=endslice;z++){
            for(let w=w0;w<w0+width;w++){
                for(let h=h0;h<h0+height;h++){
                    const Index1=(z*volume1OriginalHeight+h)*volume1OriginalWidth+w;
                    //volume1
                    const value1=flattenvolume1[Index1];
                    if(EvaluationMap.has(value1)){
                        //参照型なのでこのサブマップを変更しても値の変更は伝わる
                        const valueMap=EvaluationMap.get(value1);
                        valueMap.set("volume1",(valueMap.get("volume1")||0)+1);//体積カウント
                    }else{
                        //初出の値に対して初期設定を行う
                        const valueMap=new Map([
                            ["volume1",1],
                            ["volume2",0],
                            ["intersection",0]
                        ]);
                        EvaluationMap.set(value1,valueMap);
                    }
                    //flattensubvolume1[indexforpush]=valuebuffer;
                    //volume2
                    const Index2=(z*volume2OriginalHeight+h)*volume2OriginalWidth+w;
                    const value2=flattenvolume2[Index2];
                    if(EvaluationMap.has(value2)){
                        const valueMap=EvaluationMap.get(value2);
                        valueMap.set("volume2",(valueMap.get("volume2")||0)+1);//体積カウント
                    }else{
                        const valueMap=new Map([
                            ["volume1",0],
                            ["volume2",1],
                            ["intersection",0]
                        ]);
                        EvaluationMap.set(value2,valueMap);
                    }
                    //value1とvalue2を比較して同じならintersectionを更新する
                    if(value1===value2){
                        const valueMap=EvaluationMap.get(value1);
                        valueMap.set("intersection",(valueMap.get("intersection")||0)+1);
                    }
                    //最後にindexforpushをインクリメント
                    //indexforpush++;
                }
            }
        }
        //EvaluationMapをkeyを基準にソートする
        const SortedEvaluationMap=new Map([...EvaluationMap.entries()].sort((a,b)=>a[0]-b[0]));
        //集計結果からVDSCを算出する
        /*
        VDSCMap={maskvalue:VDSC,...}
        */
        const eps=1e-6;
        //{MaskLabel:評価値}
        const VDSCMap=new Map(
            Array.from(SortedEvaluationMap.keys()).map((maskvalue)=>{
                const valueMap=SortedEvaluationMap.get(maskvalue);
                const volume1=valueMap.get("volume1");
                const volume2=valueMap.get("volume2");
                const intersection=valueMap.get("intersection");
                const vdsc=(2*intersection+eps)/(volume1+volume2+eps);
                return [maskvalue,vdsc];//マスク値と評価値のリスト
            })
        );
        this.CalculateHistory.set(CalculateID,new Map([
            ["SelectedCanvasInfoMap",SelectedCanvasInfoMap],//このメソッド内で、あらたにPathという項目をVolumeMapから避難させるような形で追加している。よって{CanvasID:{DataType:DataID,DataType:DataID}}という感じ
            ["InputVolumeKeyPathMap",InputVolumekeyPathMap],//InputVolumeKeyとPathのマップ
            ["SelectedArea",SelectedArea],
            ["Result",VDSCMap]
        ]));
        console.log("VDSC計算終了");
        this.CreateResultDisplay();
    }
    //この評価指標はこれまでの計算履歴を一覧表示し、
    //指定されたCalculateIDの結果をハイライト強調する
    CreateResultDisplay(FocusCalculateID=null){
        //ハイライト強調なしの結果画面を新しく作成する
        //この関数が呼ばれるのはCalculateが呼ばれて新しく計算結果が増えたときのみ
        /*表部分を作成する*/
        //最初の行を設定
        //最初の行、列はthだけの予定
        const theadtr=document.createElement("tr");//行の入れ物
        const emptycell=document.createElement("th");//行タイトル用のセル
        const InitialRowClassName="InitialRow";
        const InitialColumnClassName="InitialColumn";
        emptycell.textContent="";
        emptycell.classList.add(InitialRowClassName);
        emptycell.classList.add(InitialColumnClassName);
        theadtr.appendChild(emptycell);
        for(const label of ["average",...this.ColorMapLabelList]){
            const cell=document.createElement("th");
            cell.textContent=label;
            cell.classList.add(InitialRowClassName);//先頭行
            theadtr.appendChild(cell);
        }
        this.TableHead.innerHTML="";
        this.TableHead.appendChild(theadtr);
        //データを挿入
        const TableBody=this.TableBody;
        TableBody.innerHTML="";
        for(const [CalculateID,ResultMap] of this.CalculateHistory.entries()){
            const tr=document.createElement("tr");
            tr.setAttribute("data-CalculateID",CalculateID);//クリックイベント用のデータ
            let count=0;//マスクが評価された個数をカウント
            let EvaluateValueSum=0;
            //0だけ外に出して平均値に含めない
            let maskvalue=0;
            const td=document.createElement("td");
            if(ResultMap.get("Result").has(maskvalue)){
                const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                td.textContent=EvaluateValue;
            }else{
                td.textContent="";
            }
            const trFragment=document.createDocumentFragment();
            trFragment.appendChild(td);
            //BG以外のマスク
            for(let maskvalue=1;maskvalue<this.ColorMapLabelList.length;maskvalue++){
                const td=document.createElement("td");
                if(ResultMap.get("Result").has(maskvalue)){
                    const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                    td.textContent=EvaluateValue;
                    EvaluateValueSum+=EvaluateValue;
                    count+=1;
                }else{
                    td.textContent="";
                }
                trFragment.appendChild(td);
            }
            tr.appendChild(trFragment);
            //平均欄
            const averagetd=document.createElement("td");
            averagetd.textContent=EvaluateValueSum/(count+1e-6);
            tr.prepend(averagetd);//平均は行の最初に
            const CalculateIDcell=document.createElement("th");
            CalculateIDcell.textContent=CalculateID;
            CalculateIDcell.classList.add(InitialColumnClassName);//先頭列
            tr.prepend(CalculateIDcell);
            //データ領域に行を追加
            TableBody.appendChild(tr);
        }
        //returnはしない
    }
    //指定されたFocusCalculateIDを表示するために
    //値を入れなおす。
    FocusResult(FocusCalculateID){
        //要求されたCalculateIDの結果を構成したDOMツリーを返す
        /*
        この評価指標では、それまでの履歴をすべて画面に表示する
        しかし、CalculateID(フォーカスしたいもの)を赤枠で囲み、空きスペースに情報を表示するようにする
        CalculateIDごとの列をdivで囲み、その中に各値を格納する。div列ごとににクリックイベントを設定する
        */
        /*フォーカスしているCalculateIDに関する情報を表示*/
        const FocusedResult=this.CalculateHistory.get(FocusCalculateID);
        const SelectedCanvasInfoMap=FocusedResult.get("SelectedCanvasInfoMap");//{CanvasID:{DataType:DataID,DataType:DataID,...},...,} => [[],...,]
        const InputVolumeKeyPathMap=FocusedResult.get("InputVolumeKeyPathMap");
        const SelectedCanvasArray=Array.from(SelectedCanvasInfoMap.keys());
        const TargetDataType="MASK";
        const InfoTextList=Array.from(this.InfoTextContainer.children);
        for(const [i,CanvasID] of SelectedCanvasArray.entries()){
            const DataTypeDataIDMap=SelectedCanvasInfoMap.get(CanvasID);
            const TargetDataID=DataTypeDataIDMap.get(TargetDataType);
            const InputVolumeKey=Evaluate.Array2String([TargetDataType,TargetDataID]);
            const Path=InputVolumeKeyPathMap.get(InputVolumeKey);
            const text=`Input ${i} : CanvasID = ${CanvasID}\n${Path}`;
            InfoTextList[i].textContent=text;
        }
        //trの中からclass名で検索をかけ、そこからそのクラスを除外する
        //tbody直下でSelectedClassにある行を抽出
        //今後複数選択実装に備える
        const SelectedTRList=this.TableBody.querySelectorAll(`:scope > tr.Selected`);
        for(const tr of SelectedTRList){
            tr.classList.remove("Selected");
        }
        //CalculateIDと一致する行を抽出
        //CalculateIDが重複することはないので必ず単一のエレメントとなる
        //複数選択の際も選択したCalculateIDをforで回して空リストに突っ込んでいくという方針になると思うので
        //ここはquerySelectorのままでOK
        const NewSelectTR=this.TableBody.querySelector(`:scope > tr[data-CalculateID=\"${FocusCalculateID}\"]`);
        NewSelectTR.classList.add("Selected");
        //できたものを送信
        return this.EvaluationTableForMaskResultContainer;
    }
}

class HausdorffDistance95{
    static Parcentile=0.95;
    static EvaluateName=`HausdorffDistance${this.Parcentile*100}`;
    constructor(){
        //名前。基本的には自身のクラス名を名前とする
        //this.EvaluatonName=this.constructor.name
        //this.InputNum=2;
        this.TargetDataType="MASK";
        this.CalculateHistory=new Map();//{ID:{Result,SelectedArea}}
        this.InputNum=2;//可変数の入力を受け付ける関数は下限値、上限値などの境界値を表す変数とする。
        this.InputNumConditionText=`=${this.InputNum}`;//可変長の場合は>=1のようにする。この条件はInputNumConditionCheckで表現する
        this.setResultTemplate();
        this.setUserEvents();
    }
    //この評価関数が受け付ける入力数の条件をチェックしてtrueかfalseで返す。これはすべての評価関数でもたなければならない
    CheckCalculatable(InputNum){
        //この評価関数は入力数2のときに計算可能である。
        if(InputNum===this.InputNum){
            return true;
        }else{
            return false;
        }
    }
    setResultTemplate(){
        this.EvaluationTableForMaskResultContainer=document.createElement("div");
        this.EvaluationTableForMaskResultContainer.className="EvaluationTableForMaskResultContainer";
        /*InfoText部はテンプレートとして持っておく*/
        this.InfoTextContainer=document.createElement("div");
        this.InfoTextContainer.className="EvaluationTableForMaskInfoTextContainer";
        for(let i=0;i<this.InputNum;i++){
            const InfoText=document.createElement("div");
            InfoText.className="InfoText";
            this.InfoTextContainer.appendChild(InfoText);
        }
        //console.log(Array.from(this.InfoTextContainer.children));
        this.EvaluationTableForMaskResultContainer.appendChild(this.InfoTextContainer);
        /*tableの外枠だけは持っておく*/
        const ResultTableContainer=document.createElement("div");
        ResultTableContainer.className="EvaluationTableForMaskResultTableContainer";
        const ResultTable=document.createElement("table");
        ResultTable.className="EvaluationTableForMaskResultTable";
        this.TableHead=document.createElement("thead");
        this.TableHead.className="TableHead";
        this.TableBody=document.createElement("tbody");
        this.TableBody.className="TableBody";
        this.EvaluationTableForMaskResultContainer.appendChild(ResultTableContainer);
        ResultTableContainer.appendChild(ResultTable);
        ResultTable.appendChild(this.TableHead);
        ResultTable.appendChild(this.TableBody);
    }
    setUserEvents(){
        //console.log("VolumetricDSCからイベントを設定2");
        //console.log(this.TableBody);
        this.TableBody.addEventListener("click",(e)=>{
            //console.log("イベント発火");
            const TargetTR=e.target.closest("tr");
            if(TargetTR){
                const CalculateID=parseInt(TargetTR.getAttribute("data-CalculateID"));
                //console.log(CalculateID);
                EvaluateObject.FocusHistoryListItem(CalculateID);
            }
        });
    }
    Calculate(CalculateData){
        /*
        SelectedAreaはどの関数でも共通の引数として、
        w0,h0,width,height,startslice,endsliceについて定めたMapとする
        */
        //console.log(CalculateData);
        const CalculateID=CalculateData.get("CalculateID");

        const SelectedArea=CalculateData.get("SelectedArea");
        const w0=SelectedArea.get("w0");
        const h0=SelectedArea.get("h0");
        const width=SelectedArea.get("width");
        const height=SelectedArea.get("height");
        const startslice=SelectedArea.get("startslice");
        const endslice=SelectedArea.get("endslice");

        const SelectedCanvasInfoMap=structuredClone(CalculateData.get("SelectedCanvasInfoMap"));//参照を切る。ただ代入するだけではEvaluate内のCurrentSelectedCanvasIDSetまで影響することを確認した。
        //SelectedCanvasInfoMap={CanvasID:{DataType:???,DataID:???},...}
        const InputVolumeMap=CalculateData.get("InputVolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}をvalueとするMap
        const InputVolumeKeyArray=Array.from(SelectedCanvasInfoMap.values()).map((DataTypeDataIDMap)=>{
            const DataType=DataTypeDataIDMap.get("DataType");
            const DataID=DataTypeDataIDMap.get("DataID");
            const InputVolumeKey=Evaluate.Array2String([DataType,DataID]);
            DataTypeDataIDMap.set("Path",InputVolumeMap.get(InputVolumeKey).get("Path"));
            return InputVolumeKey;
        });
        
        const ExtraDataMap=CalculateData.get("ExtraDataMap");
        if(ExtraDataMap.has("ColorMapLabelArray")){//存在するときに新しく代入するよ
            this.ColorMapLabelList=ExtraDataMap.get("ColorMapLabelArray");//表示するときにこのラベルを使う
        }
        //2つのボリュームの輪郭点を集計する
        /*
        {
            InputVolumeKey:{
                maskvalue:[[],[],[],...]
                maskvalue:,
            }
        }
        これに対してInputVolumeKeyでアクセスして距離を計算していく。こうすれば同じデータを指しているときに無駄に輪郭集計をしなくて済む
        重要：輪郭点集合A,Bのどちらかが空集合の場合、無限とする。この実装上では、どちらかでmaskvalueの座標リスト自体がない場合が起こりえる。この場合はそのmaskvalueの評価値は無限大とする
        この実装ではmaskvalueが出現したタイミングで新たにmaskvalueをkeyとする領域が作られるため、どちらも空集合ということは起こりえないので気にする必要はない
        また、maskvalueのkeyがある＝一度は画像内に出現していることになるため、keyのみがあり配列自体は空ということも起こらない
        */
        const InputVolumeKeyContourPointsMap=new Map();
        const InputVolumeKeySpacingDataMap=new Map();
        for(const [InputVolumeKey,InputVolume] of InputVolumeMap.entries()){
            const FlattenVolume=InputVolume.get("Volume");
            const OriginalSize=InputVolume.get("Size");
            const OriginalWidth=OriginalSize.get("width");
            const OriginalHeight=OriginalSize.get("height");
            //SpacingDataを格納
            InputVolumeKeySpacingDataMap.set(InputVolumeKey,InputVolume.get("SpacingDataMap"));
            //ここから、このボリュームの切り取り範囲を走査して輪郭点を抽出する
            const ContourPointsMap=new Map();
            const starth=h0,endh=h0+height-1;
            const startw=w0,endw=w0+width-1;
            //console.log(InputVolumeKey);
            for(let z=startslice;z<=endslice;z++){
                for(let h=starth;h<=endh;h++){
                    for(let w=startw;w<=endw;w++){
                        //const Index1=(z*volume1OriginalHeight+h)*volume1OriginalWidth+w;
                        const FocusPointsIndex=(z*OriginalHeight+h)*OriginalWidth+w;//(Z,H,W)⇒indexに読み替え
                        const FocusPointMaskValue=FlattenVolume[FocusPointsIndex];//注目点のマスク値を記録
                        if(!ContourPointsMap.has(FocusPointMaskValue)){
                            ContourPointsMap.set(FocusPointMaskValue,[]);
                        }
                        /*
                        26近傍の画素を確認
                        流れ、z,w,hそれぞれを+-1下座標について、切り取り範囲内にあるか確認する。切り取り範囲がボリュームの範囲を超えることはないため、切り取り範囲内の存在確認のみでOK
                        ６近傍のマスク値にどれかが注目しているマスク値と異なれば境界に位置する画素とする
                        */
                        //まずは選択領域の端点でないか確認する
                        //輪郭点として保存する座標は切り取り後の座標に変換する
                        const FocasPoint=[z-startslice,h-starth,w-startw];
                        if((z===startslice||z===endslice)||(h===starth||h===endh)||(w===startw||w===endw)){
                            //選択領域の端っこにあるので境界点として登録
                            ContourPointsMap.get(FocusPointMaskValue).push(FocasPoint);
                        }else{
                            //6近傍走査
                            let FocusPointContourFlag=false;
                            const OffsetArray=[
                                [-1,0,0],[1,0,0],//z
                                [0,-1,0],[0,1,0],//h
                                [0,0,-1],[0,0,1]
                            ]
                            const OffsetArrayLength=OffsetArray.length;
                            for(let i=0;!FocusPointContourFlag&&i<OffsetArrayLength;i++){
                                const Offset=OffsetArray[i];
                                const NeiborZ=z+Offset[0];
                                const NeiborH=h+Offset[1];
                                const NeiborW=w+Offset[2];
                                const NeiborPointIndex=(NeiborZ*OriginalHeight+NeiborH)*OriginalWidth+NeiborW;
                                const NeiborPointMaskValue=FlattenVolume[NeiborPointIndex];
                                if(FocusPointMaskValue!==NeiborPointMaskValue){
                                    FocusPointContourFlag=true;
                                    ContourPointsMap.get(FocusPointMaskValue).push(FocasPoint);
                                }
                            }
                        }
                    }
                }
            }
            InputVolumeKeyContourPointsMap.set(InputVolumeKey,ContourPointsMap);
        }
        console.log("境界点集合抽出完了");
        const [InputVolumeKey1,InputVolumeKey2]=InputVolumeKeyArray;
        const ContourPointsMap1=InputVolumeKeyContourPointsMap.get(InputVolumeKey1);
        const ContourPointsMap2=InputVolumeKeyContourPointsMap.get(InputVolumeKey2);
        const SpacingDataMap1=InputVolumeKeySpacingDataMap.get(InputVolumeKey1);
        const SpacingDataMap2=InputVolumeKeySpacingDataMap.get(InputVolumeKey2);
        const ApparaedMaskValue=new Set([...ContourPointsMap1.keys(),...ContourPointsMap2.keys()].sort((a,b)=>a-b));//これで2つの入力で出現するマスク値の和集合できる。マスクの値は昇順ソート済み
        //1=>2への最短距離の最大値を求める
        const HDMap=new Map();
        //const TargetZSize=endslice-startslice+1;
        const TargetHSize=height;
        const TargetWSize=width;
        for(const MaskValue of ApparaedMaskValue){
            //まずはこのマスクの境界点集合を両方で持っているか
            console.log(MaskValue,"評価開始");
            if(MaskValue===0||!(ContourPointsMap1.has(MaskValue)&&ContourPointsMap2.has(MaskValue))){
                //どちらかにしかないので評価値を無限大とする
                HDMap.set(MaskValue,Infinity);
            }else{
                //まずはこのマスクの距離マップを作成しよう
                const MaskContourArray1=ContourPointsMap1.get(MaskValue);
                const DistanceMapVolume1=this.EDT_3D(MaskContourArray1,startslice,endslice,TargetHSize,TargetWSize,SpacingDataMap1);//切り取られたサイズのFlattenが返ってくる。Originalのサイズではないことに注意
                const MaskContourArray2=ContourPointsMap2.get(MaskValue);
                const DistanceMapVolume2=this.EDT_3D(MaskContourArray2,startslice,endslice,TargetHSize,TargetWSize,SpacingDataMap2);
                const DistanceSet=new Set();//ここに距離を集約する
                //1. 1⇒2の距離を集計する
                for(const [z,h,w] of MaskContourArray1){
                    //この座標でDistanceMapVolume2を参照する
                    const index=(z*TargetHSize+h)*TargetWSize+w;
                    DistanceSet.add(DistanceMapVolume2[index]);
                }
                //2⇒1の距離を集計する
                for(const [z,h,w] of MaskContourArray2){
                    const index=(z*TargetHSize+h)*TargetWSize+w;
                    DistanceSet.add(DistanceMapVolume1[index]);
                }
                //集約した距離の中から所望の位置の距離を持ってくる
                //console.log(this.constructor.Parcentile);
                const EvaluateValueIndex=Math.ceil(DistanceSet.size*this.constructor.Parcentile)-1;//this.constructorはこのインスタンスを作ったクラス自体を指している。つまり、静的プロパティを参照している
                //console.log(DistanceSet.size,this.Parcentile,EvaluateValueIndex);
                const SortedDistanceArray=Array.from(DistanceSet).sort((a,b)=>a-b);
                //console.log(SortedDistanceArray);
                const EvaluateValue=Math.sqrt(SortedDistanceArray[EvaluateValueIndex]);
                HDMap.set(MaskValue,EvaluateValue);
            }
        }
        this.CalculateHistory.set(CalculateID,new Map([
            ["SelectedCanvasInfoMap",SelectedCanvasInfoMap],//このメソッド内で、あらたにPathという項目をVolumeMapから避難させるような形で追加している。よって{CanvasID:{Layer:,DataID:,Path:}}という感じ
            ["SelectedArea",SelectedArea],
            ["Result",HDMap]
        ]));
        console.log(`${this.constructor.EvaluateName}の計算終了`);
        console.log(HDMap);
        this.CreateResultDisplay();
    }
    
    //この評価指標はこれまでの計算履歴を一覧表示し、
    //指定されたCalculateIDの結果をハイライト強調する
    CreateResultDisplay(FocusCalculateID=null){
        //ハイライト強調なしの結果画面を新しく作成する
        //この関数が呼ばれるのはCalculateが呼ばれて新しく計算結果が増えたときのみ
        /*表部分を作成する*/
        //最初の行を設定
        //最初の行、列はthだけの予定
        const theadtr=document.createElement("tr");//行の入れ物
        const emptycell=document.createElement("th");//行タイトル用のセル
        const InitialRowClassName="InitialRow";
        const InitialColumnClassName="InitialColumn";
        emptycell.textContent="";
        emptycell.classList.add(InitialRowClassName);
        emptycell.classList.add(InitialColumnClassName);
        //この評価指標にはmmという単位があるのでそれを記入する
        emptycell.textContent="( mm )"
        theadtr.appendChild(emptycell);
        for(const label of ["average",...this.ColorMapLabelList]){
            const cell=document.createElement("th");
            cell.textContent=label;
            cell.classList.add(InitialRowClassName);//先頭行
            theadtr.appendChild(cell);
        }
        this.TableHead.innerHTML="";
        this.TableHead.appendChild(theadtr);
        //データを挿入
        const TableBody=this.TableBody;
        TableBody.innerHTML="";
        for(const [CalculateID,ResultMap] of this.CalculateHistory.entries()){
            const tr=document.createElement("tr");
            tr.setAttribute("data-CalculateID",CalculateID);//クリックイベント用のデータ
            let count=0;//マスクが評価された個数をカウント
            let EvaluateValueSum=0;
            //0だけ外に出して平均値に含めない
            let maskvalue=0;
            const td=document.createElement("td");
            if(ResultMap.get("Result").has(maskvalue)){
                const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                td.textContent=EvaluateValue;
            }else{
                td.textContent="";
            }
            const trFragment=document.createDocumentFragment();
            trFragment.appendChild(td);
            //BG以外のマスク
            for(let maskvalue=1;maskvalue<this.ColorMapLabelList.length;maskvalue++){
                const td=document.createElement("td");
                if(ResultMap.get("Result").has(maskvalue)){
                    const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                    td.textContent=EvaluateValue;
                    EvaluateValueSum+=EvaluateValue;
                    count+=1;
                }else{
                    td.textContent="";
                }
                trFragment.appendChild(td);
            }
            tr.appendChild(trFragment);
            //平均欄
            const averagetd=document.createElement("td");
            averagetd.textContent=EvaluateValueSum/(count+1e-6);
            tr.prepend(averagetd);//平均は行の最初に
            const CalculateIDcell=document.createElement("th");
            CalculateIDcell.textContent=CalculateID;
            CalculateIDcell.classList.add(InitialColumnClassName);//先頭列
            tr.prepend(CalculateIDcell);
            //データ領域に行を追加
            TableBody.appendChild(tr);
        }
        //returnはしない
    }
    //指定されたFocusCalculateIDを表示するために
    //値を入れなおす。
    FocusResult(FocusCalculateID){
        //要求されたCalculateIDの結果を構成したDOMツリーを返す
        /*
        この評価指標では、それまでの履歴をすべて画面に表示する
        しかし、CalculateID(フォーカスしたいもの)を赤枠で囲み、空きスペースに情報を表示するようにする
        CalculateIDごとの列をdivで囲み、その中に各値を格納する。div列ごとににクリックイベントを設定する
        */
        /*フォーカスしているCalculateIDに関する情報を表示*/
        const FocusedResult=this.CalculateHistory.get(FocusCalculateID);
        const SelectedCanvasInfoArray=Array.from(FocusedResult.get("SelectedCanvasInfoMap").entries());//{CanvasID:{DataType:,DataID:,Path:},...} => [[],...,]
        const InfoTextList=Array.from(this.InfoTextContainer.children);
        for(let i=0;i<SelectedCanvasInfoArray.length;i++){
            const [CanvasID,SelectedCanvasInfo]=SelectedCanvasInfoArray[i];
            const Path=SelectedCanvasInfo.get("Path");
            //console.log(InfoTextList[i].tagName);
            const text=`Input ${i} : CanvasID = ${CanvasID}\n${Path}`;
            InfoTextList[i].textContent=text;
        }
        //trの中からclass名で検索をかけ、そこからそのクラスを除外する
        //tbody直下でSelectedClassにある行を抽出
        //今後複数選択実装に備える
        const SelectedTRList=this.TableBody.querySelectorAll(`:scope > tr.Selected`);
        for(const tr of SelectedTRList){
            tr.classList.remove("Selected");
        }
        //CalculateIDと一致する行を抽出
        //CalculateIDが重複することはないので必ず単一のエレメントとなる
        //複数選択の際も選択したCalculateIDをforで回して空リストに突っ込んでいくという方針になると思うので
        //ここはquerySelectorのままでOK
        const NewSelectTR=this.TableBody.querySelector(`:scope > tr[data-CalculateID=\"${FocusCalculateID}\"]`);
        NewSelectTR.classList.add("Selected");
        //できたものを送信
        return this.EvaluationTableForMaskResultContainer;
    }
    /*
    Calculate用に必要になる関数
    この評価指標独自のもの
    */
    EDT_3D(ContourPointArray,StartZ,EndZ,H,W,SpacingDataMap){
        /*
        境界点の集合と、ボリュームのサイズが渡される
        前景を境界点、光景をそれ以外として、各位置から最も近い前景までの距離を要素として持つ距離マップをもどす
        戻り値は１次元配列である。
        詳しくは1D EDTや、1D パラボラ法 HD95 3次元拡張で検索
        */
        //3Dボリュームを初期化
        const BigValue=10e+8;//この直方体の最大距離
        const Z=EndZ-StartZ+1;
        const VolumeSize=Z*H*W;
        const DistanceMapVolume=new Array(VolumeSize).fill(BigValue);//境界点だけ0、それ以外はとても大きい数字が入っている
        for(const [z,h,w] of ContourPointArray ){
            //境界点のみに0を入れる
            const index=(z*H+h)*W+w;
            DistanceMapVolume[index]=0
        }
        //W方向に1D EDT
        const WSpacing=SpacingDataMap.get("xSpacing");
        for(let z=0;z<Z;z++){
            for(let h=0;h<H;h++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(W);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(W+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0;
                IntervalEndpointArray[0]=(-Infinity);
                IntervalEndpointArray[1]=(+Infinity);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(W);
                for(let w=0;w<W;w++){
                    VolumeParts[w]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<W;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1
                for(let w=0;w<W;w++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<w){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    const diff=(w-EnvelopePoint)*WSpacing;//Pixel距離をmmに変換する
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        //H方向に1D EDT
        const HSpacing=SpacingDataMap.get("ySpacing");
        for(let z=0;z<Z;z++){
            for(let w=0;w<W;w++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(H);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(H+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0
                IntervalEndpointArray[0]=(-BigValue);
                IntervalEndpointArray[1]=(BigValue);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(H);
                for(let h=0;h<H;h++){
                    VolumeParts[h]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<H;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1
                for(let h=0;h<H;h++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<h){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    const diff=(h-EnvelopePoint)*HSpacing;//Pixel距離をmmに変換する
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        //Z方向に1D EDT
        const Index2PositionMap=SpacingDataMap.get("i2pMap");
        for(let h=0;h<H;h++){
            for(let w=0;w<W;w++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(Z);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(Z+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0
                IntervalEndpointArray[0]=(-BigValue);
                IntervalEndpointArray[1]=(BigValue);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(Z);
                for(let z=0;z<Z;z++){
                    VolumeParts[z]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<Z;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1, Envelopeのポインタも兼任
                for(let z=0;z<Z;z++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<z){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    //Z方向は不均一の可能性もあるようだ
                    //とりあえずは、Pixel基準で最短距離を求めた後、これをmmに変換する
                    const diff=Index2PositionMap.get(StartZ+z)-Index2PositionMap.get(StartZ+EnvelopePoint);
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        return DistanceMapVolume;
    }
}
class HausdorffDistance100 extends HausdorffDistance95{
    static Parcentile=1;
    static EvaluateName=`HauseDorffDistance${this.Parcentile*100}`;
}
//SurfaceDice
class SurfaceDice{
    static Tau=3;//mm
    static EvaluateName="SurfaceDice";
    constructor(){
        //名前。基本的には自身のクラス名を名前とする
        //this.EvaluatonName=this.constructor.name
        //this.InputNum=2;
        this.TargetDataType="MASK";
        this.CalculateHistory=new Map();//{ID:{Result,SelectedArea}}
        this.InputNum=2;//可変数の入力を受け付ける関数は下限値、上限値などの境界値を表す変数とする。
        this.InputNumConditionText=`=${this.InputNum}`;//可変長の場合は>=1のようにする。この条件はInputNumConditionCheckで表現する
        this.setResultTemplate();
        this.setUserEvents();
    }
    //この評価関数が受け付ける入力数の条件をチェックしてtrueかfalseで返す。これはすべての評価関数でもたなければならない
    CheckCalculatable(InputNum){
        //この評価関数は入力数2のときに計算可能である。
        if(InputNum===this.InputNum){
            return true;
        }else{
            return false;
        }
    }
    setResultTemplate(){
        this.EvaluationTableForMaskResultContainer=document.createElement("div");
        this.EvaluationTableForMaskResultContainer.className="EvaluationTableForMaskResultContainer";
        /*InfoText部はテンプレートとして持っておく*/
        this.InfoTextContainer=document.createElement("div");
        this.InfoTextContainer.className="EvaluationTableForMaskInfoTextContainer";
        for(let i=0;i<this.InputNum;i++){
            const InfoText=document.createElement("div");
            InfoText.className="InfoText";
            this.InfoTextContainer.appendChild(InfoText);
        }
        //console.log(Array.from(this.InfoTextContainer.children));
        this.EvaluationTableForMaskResultContainer.appendChild(this.InfoTextContainer);
        /*tableの外枠だけは持っておく*/
        const ResultTableContainer=document.createElement("div");
        ResultTableContainer.className="EvaluationTableForMaskResultTableContainer";
        const ResultTable=document.createElement("table");
        ResultTable.className="EvaluationTableForMaskResultTable";
        this.TableHead=document.createElement("thead");
        this.TableHead.className="TableHead";
        this.TableBody=document.createElement("tbody");
        this.TableBody.className="TableBody";
        this.EvaluationTableForMaskResultContainer.appendChild(ResultTableContainer);
        ResultTableContainer.appendChild(ResultTable);
        ResultTable.appendChild(this.TableHead);
        ResultTable.appendChild(this.TableBody);
    }
    setUserEvents(){
        //console.log("VolumetricDSCからイベントを設定2");
        //console.log(this.TableBody);
        this.TableBody.addEventListener("click",(e)=>{
            //console.log("イベント発火");
            const TargetTR=e.target.closest("tr");
            if(TargetTR){
                const CalculateID=parseInt(TargetTR.getAttribute("data-CalculateID"));
                //console.log(CalculateID);
                EvaluateObject.FocusHistoryListItem(CalculateID);
            }
        });
    }
    Calculate(CalculateData){
        /*
        SelectedAreaはどの関数でも共通の引数として、
        w0,h0,width,height,startslice,endsliceについて定めたMapとする
        */
        //console.log(CalculateData);
        const CalculateID=CalculateData.get("CalculateID");

        const SelectedArea=CalculateData.get("SelectedArea");
        const w0=SelectedArea.get("w0");
        const h0=SelectedArea.get("h0");
        const width=SelectedArea.get("width");
        const height=SelectedArea.get("height");
        const startslice=SelectedArea.get("startslice");
        const endslice=SelectedArea.get("endslice");

        const SelectedCanvasInfoMap=structuredClone(CalculateData.get("SelectedCanvasInfoMap"));//参照を切る。ただ代入するだけではEvaluate内のCurrentSelectedCanvasIDSetまで影響することを確認した。
        //SelectedCanvasInfoMap={CanvasID:{DataType:???,DataID:???},...}
        const InputVolumeMap=CalculateData.get("InputVolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}をvalueとするMap
        const InputVolumeKeyArray=Array.from(SelectedCanvasInfoMap.values()).map((DataTypeDataIDMap)=>{
            const DataType=DataTypeDataIDMap.get("DataType");
            const DataID=DataTypeDataIDMap.get("DataID");
            const InputVolumeKey=Evaluate.Array2String([DataType,DataID]);
            DataTypeDataIDMap.set("Path",InputVolumeMap.get(InputVolumeKey).get("Path"));
            return InputVolumeKey;
        });
        
        const ExtraDataMap=CalculateData.get("ExtraDataMap");
        if(ExtraDataMap.has("ColorMapLabelArray")){//存在するときに新しく代入するよ
            this.ColorMapLabelList=ExtraDataMap.get("ColorMapLabelArray");//表示するときにこのラベルを使う
        }
        //2つのボリュームの輪郭点を集計する
        /*
        {
            InputVolumeKey:{
                maskvalue:[[],[],[],...]
                maskvalue:,
            }
        }
        これに対してInputVolumeKeyでアクセスして距離を計算していく。こうすれば同じデータを指しているときに無駄に輪郭集計をしなくて済む
        重要：輪郭点集合A,Bのどちらかが空集合の場合、無限とする。この実装上では、どちらかでmaskvalueの座標リスト自体がない場合が起こりえる。この場合はそのmaskvalueの評価値は無限大とする
        この実装ではmaskvalueが出現したタイミングで新たにmaskvalueをkeyとする領域が作られるため、どちらも空集合ということは起こりえないので気にする必要はない
        また、maskvalueのkeyがある＝一度は画像内に出現していることになるため、keyのみがあり配列自体は空ということも起こらない
        */
        const InputVolumeKeyContourPointsMap=new Map();
        const InputVolumeKeySpacingDataMap=new Map();
        for(const [InputVolumeKey,InputVolume] of InputVolumeMap.entries()){
            const FlattenVolume=InputVolume.get("Volume");
            const OriginalSize=InputVolume.get("Size");
            const OriginalWidth=OriginalSize.get("width");
            const OriginalHeight=OriginalSize.get("height");
            const SpacingDataMap=InputVolume.get("SpacingDataMap");
            //SpacingDataを格納
            //console.log(InputVolumeKey);
            //console.log(SpacingDataMap);
            InputVolumeKeySpacingDataMap.set(InputVolumeKey,SpacingDataMap);
            //ここから、このボリュームの切り取り範囲を走査して輪郭点を抽出する
            const ContourPointsMap=new Map();
            const starth=h0,endh=h0+height-1;
            const startw=w0,endw=w0+width-1;
            //console.log(InputVolumeKey);
            for(let z=startslice;z<=endslice;z++){
                for(let h=starth;h<=endh;h++){
                    for(let w=startw;w<=endw;w++){
                        //const Index1=(z*volume1OriginalHeight+h)*volume1OriginalWidth+w;
                        const FocusPointsIndex=(z*OriginalHeight+h)*OriginalWidth+w;//(Z,H,W)⇒indexに読み替え
                        const FocusPointMaskValue=FlattenVolume[FocusPointsIndex];//注目点のマスク値を記録
                        if(!ContourPointsMap.has(FocusPointMaskValue)){
                            ContourPointsMap.set(FocusPointMaskValue,[]);
                        }
                        /*
                        26近傍の画素を確認
                        流れ、z,w,hそれぞれを+-1下座標について、切り取り範囲内にあるか確認する。切り取り範囲がボリュームの範囲を超えることはないため、切り取り範囲内の存在確認のみでOK
                        ６近傍のマスク値にどれかが注目しているマスク値と異なれば境界に位置する画素とする
                        */
                        //まずは選択領域の端点でないか確認する
                        //輪郭点として保存する座標は切り取り後の座標に変換する
                        const FocasPoint=[z-startslice,h-starth,w-startw];
                        if((z===startslice||z===endslice)||(h===starth||h===endh)||(w===startw||w===endw)){
                            //選択領域の端っこにあるので境界点として登録
                            ContourPointsMap.get(FocusPointMaskValue).push(FocasPoint);
                        }else{
                            //6近傍走査
                            let FocusPointContourFlag=false;
                            const OffsetArray=[
                                [-1,0,0],[1,0,0],//z
                                [0,-1,0],[0,1,0],//h
                                [0,0,-1],[0,0,1]
                            ]
                            const OffsetArrayLength=OffsetArray.length;
                            for(let i=0;!FocusPointContourFlag&&i<OffsetArrayLength;i++){
                                const Offset=OffsetArray[i];
                                const NeiborZ=z+Offset[0];
                                const NeiborH=h+Offset[1];
                                const NeiborW=w+Offset[2];
                                const NeiborPointIndex=(NeiborZ*OriginalHeight+NeiborH)*OriginalWidth+NeiborW;
                                const NeiborPointMaskValue=FlattenVolume[NeiborPointIndex];
                                if(FocusPointMaskValue!==NeiborPointMaskValue){
                                    FocusPointContourFlag=true;
                                    ContourPointsMap.get(FocusPointMaskValue).push(FocasPoint);
                                }
                            }
                        }
                    }
                }
            }
            InputVolumeKeyContourPointsMap.set(InputVolumeKey,ContourPointsMap);
        }
        console.log("境界点集合抽出完了");
        const [InputVolumeKey1,InputVolumeKey2]=InputVolumeKeyArray;
        const ContourPointsMap1=InputVolumeKeyContourPointsMap.get(InputVolumeKey1);
        const ContourPointsMap2=InputVolumeKeyContourPointsMap.get(InputVolumeKey2);
        const SpacingDataMap1=InputVolumeKeySpacingDataMap.get(InputVolumeKey1);
        const SpacingDataMap2=InputVolumeKeySpacingDataMap.get(InputVolumeKey2);
        const ApparaedMaskValue=new Set([...ContourPointsMap1.keys(),...ContourPointsMap2.keys()].sort((a,b)=>a-b));//これで2つの入力で出現するマスク値の和集合できる。マスクの値は昇順ソート済み
        //1=>2への最短距離の最大値を求める
        const HDMap=new Map();
        //const TargetZSize=endslice-startslice+1;
        const TargetHSize=height;
        const TargetWSize=width;
        for(const MaskValue of ApparaedMaskValue){
            //まずはこのマスクの境界点集合を両方で持っているか
            console.log(MaskValue,"評価開始");
            if(MaskValue===0||!(ContourPointsMap1.has(MaskValue)&&ContourPointsMap2.has(MaskValue))){
                //どちらかにしかないので評価値を無限大とする
                HDMap.set(MaskValue,Infinity);
            }else{
                //まずはこのマスクの距離マップを作成しよう
                const MaskContourArray1=ContourPointsMap1.get(MaskValue);
                const DistanceMapVolume1=this.EDT_3D(MaskContourArray1,startslice,endslice,TargetHSize,TargetWSize,SpacingDataMap1);//切り取られたサイズのFlattenが返ってくる。Originalのサイズではないことに注意
                const MaskContourArray2=ContourPointsMap2.get(MaskValue);
                const DistanceMapVolume2=this.EDT_3D(MaskContourArray2,startslice,endslice,TargetHSize,TargetWSize,SpacingDataMap2);
                const DistanceSet=new Set();//ここに距離を集約する
                //1. 1⇒2の距離を集計する
                let TauCount=0;//許容範囲内に入っている境界点をカウントする
                for(const [z,h,w] of MaskContourArray1){
                    //この座標でDistanceMapVolume2を参照する
                    const index=(z*TargetHSize+h)*TargetWSize+w;
                    if(DistanceMapVolume2[index]<=this.constructor.Tau){
                        TauCount++;
                    }
                }
                //2⇒1の距離を集計する
                for(const [z,h,w] of MaskContourArray2){
                    const index=(z*TargetHSize+h)*TargetWSize+w;
                    if(DistanceMapVolume1[index]<=this.constructor.Tau){
                        TauCount++;
                    }
                }
                const EvaluateValue=TauCount/(MaskContourArray1.length+MaskContourArray2.length);
                HDMap.set(MaskValue,EvaluateValue);
            }
        }
        this.CalculateHistory.set(CalculateID,new Map([
            ["SelectedCanvasInfoMap",SelectedCanvasInfoMap],//このメソッド内で、あらたにPathという項目をVolumeMapから避難させるような形で追加している。よって{CanvasID:{Layer:,DataID:,Path:}}という感じ
            ["SelectedArea",SelectedArea],
            ["Result",HDMap]
        ]));
        console.log(`${this.constructor.EvaluateName}の計算終了`);
        console.log(HDMap);
        this.CreateResultDisplay();
    }
    
    //この評価指標はこれまでの計算履歴を一覧表示し、
    //指定されたCalculateIDの結果をハイライト強調する
    CreateResultDisplay(FocusCalculateID=null){
        //ハイライト強調なしの結果画面を新しく作成する
        //この関数が呼ばれるのはCalculateが呼ばれて新しく計算結果が増えたときのみ
        /*表部分を作成する*/
        //最初の行を設定
        //最初の行、列はthだけの予定
        const theadtr=document.createElement("tr");//行の入れ物
        const emptycell=document.createElement("th");//行タイトル用のセル
        const InitialRowClassName="InitialRow";
        const InitialColumnClassName="InitialColumn";
        emptycell.textContent="";
        emptycell.classList.add(InitialRowClassName);
        emptycell.classList.add(InitialColumnClassName);
        //この評価指標には許容値があるのでそこを記入する
        emptycell.textContent=`τ = ${this.constructor.Tau} ( mm )`;
        theadtr.appendChild(emptycell);
        for(const label of ["average",...this.ColorMapLabelList]){
            const cell=document.createElement("th");
            cell.textContent=label;
            cell.classList.add(InitialRowClassName);//先頭行
            theadtr.appendChild(cell);
        }
        this.TableHead.innerHTML="";
        this.TableHead.appendChild(theadtr);
        //データを挿入
        const TableBody=this.TableBody;
        TableBody.innerHTML="";
        for(const [CalculateID,ResultMap] of this.CalculateHistory.entries()){
            const tr=document.createElement("tr");
            tr.setAttribute("data-CalculateID",CalculateID);//クリックイベント用のデータ
            let count=0;//マスクが評価された個数をカウント
            let EvaluateValueSum=0;
            //0だけ外に出して平均値に含めない
            let maskvalue=0;
            const td=document.createElement("td");
            if(ResultMap.get("Result").has(maskvalue)){
                const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                td.textContent=EvaluateValue;
            }else{
                td.textContent="";
            }
            const trFragment=document.createDocumentFragment();
            trFragment.appendChild(td);
            //BG以外のマスク
            for(let maskvalue=1;maskvalue<this.ColorMapLabelList.length;maskvalue++){
                const td=document.createElement("td");
                if(ResultMap.get("Result").has(maskvalue)){
                    const EvaluateValue=ResultMap.get("Result").get(maskvalue);
                    td.textContent=EvaluateValue;
                    EvaluateValueSum+=EvaluateValue;
                    count+=1;
                }else{
                    td.textContent="";
                }
                trFragment.appendChild(td);
            }
            tr.appendChild(trFragment);
            //平均欄
            const averagetd=document.createElement("td");
            averagetd.textContent=EvaluateValueSum/(count+1e-6);
            tr.prepend(averagetd);//平均は行の最初に
            const CalculateIDcell=document.createElement("th");
            CalculateIDcell.textContent=CalculateID;
            CalculateIDcell.classList.add(InitialColumnClassName);//先頭列
            tr.prepend(CalculateIDcell);
            //データ領域に行を追加
            TableBody.appendChild(tr);
        }
        //returnはしない
    }
    //指定されたFocusCalculateIDを表示するために
    //値を入れなおす。
    FocusResult(FocusCalculateID){
        //要求されたCalculateIDの結果を構成したDOMツリーを返す
        /*
        この評価指標では、それまでの履歴をすべて画面に表示する
        しかし、CalculateID(フォーカスしたいもの)を赤枠で囲み、空きスペースに情報を表示するようにする
        CalculateIDごとの列をdivで囲み、その中に各値を格納する。div列ごとににクリックイベントを設定する
        */
        /*フォーカスしているCalculateIDに関する情報を表示*/
        const FocusedResult=this.CalculateHistory.get(FocusCalculateID);
        const SelectedCanvasInfoArray=Array.from(FocusedResult.get("SelectedCanvasInfoMap").entries());//{CanvasID:{DataType:,DataID:,Path:},...} => [[],...,]
        const InfoTextList=Array.from(this.InfoTextContainer.children);
        for(let i=0;i<SelectedCanvasInfoArray.length;i++){
            const [CanvasID,SelectedCanvasInfo]=SelectedCanvasInfoArray[i];
            const Path=SelectedCanvasInfo.get("Path");
            //console.log(InfoTextList[i].tagName);
            const text=`Input ${i} : CanvasID = ${CanvasID}\n${Path}`;
            InfoTextList[i].textContent=text;
        }
        //trの中からclass名で検索をかけ、そこからそのクラスを除外する
        //tbody直下でSelectedClassにある行を抽出
        //今後複数選択実装に備える
        const SelectedTRList=this.TableBody.querySelectorAll(`:scope > tr.Selected`);
        for(const tr of SelectedTRList){
            tr.classList.remove("Selected");
        }
        //CalculateIDと一致する行を抽出
        //CalculateIDが重複することはないので必ず単一のエレメントとなる
        //複数選択の際も選択したCalculateIDをforで回して空リストに突っ込んでいくという方針になると思うので
        //ここはquerySelectorのままでOK
        const NewSelectTR=this.TableBody.querySelector(`:scope > tr[data-CalculateID=\"${FocusCalculateID}\"]`);
        NewSelectTR.classList.add("Selected");
        //できたものを送信
        return this.EvaluationTableForMaskResultContainer;
    }
    /*
    Calculate用に必要になる関数
    この評価指標独自のもの
    */
    EDT_3D(ContourPointArray,StartZ,EndZ,H,W,SpacingDataMap){
        /*
        境界点の集合と、ボリュームのサイズが渡される
        前景を境界点、光景をそれ以外として、各位置から最も近い前景までの距離を要素として持つ距離マップをもどす
        戻り値は１次元配列である。
        詳しくは1D EDTや、1D パラボラ法 HD95 3次元拡張で検索
        */
        //3Dボリュームを初期化
        const BigValue=10e+8;//この直方体の最大距離
        const Z=EndZ-StartZ+1;
        const VolumeSize=Z*H*W;
        const DistanceMapVolume=new Array(VolumeSize).fill(BigValue);//境界点だけ0、それ以外はとても大きい数字が入っている
        for(const [z,h,w] of ContourPointArray ){
            //境界点のみに0を入れる
            const index=(z*H+h)*W+w;
            DistanceMapVolume[index]=0
        }
        //W方向に1D EDT
        const WSpacing=SpacingDataMap.get("xSpacing");
        for(let z=0;z<Z;z++){
            for(let h=0;h<H;h++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(W);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(W+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0;
                IntervalEndpointArray[0]=(-Infinity);
                IntervalEndpointArray[1]=(+Infinity);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(W);
                for(let w=0;w<W;w++){
                    VolumeParts[w]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<W;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1
                for(let w=0;w<W;w++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<w){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    const diff=(w-EnvelopePoint)*WSpacing;//Pixel距離をmmに変換する
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        //H方向に1D EDT
        const HSpacing=SpacingDataMap.get("ySpacing");
        for(let z=0;z<Z;z++){
            for(let w=0;w<W;w++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(H);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(H+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0
                IntervalEndpointArray[0]=(-BigValue);
                IntervalEndpointArray[1]=(BigValue);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(H);
                for(let h=0;h<H;h++){
                    VolumeParts[h]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<H;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1
                for(let h=0;h<H;h++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<h){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    const diff=(h-EnvelopePoint)*HSpacing;//Pixel距離をmmに変換する
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        //Z方向に1D EDT
        const Index2PositionMap=SpacingDataMap.get("i2pMap");
        for(let h=0;h<H;h++){
            for(let w=0;w<W;w++){
                //ここから1D EDT
                //まずは最初の包絡線を入れる
                const EnvelopeArray=new Array(Z);//包絡線のインデックス＝度の座標を中心とする包絡線を使うか
                const IntervalEndpointArray=new Array(Z+1);//各包絡線の支配領域。k番目の包絡線はk~k+1の間で最小値となる
                EnvelopeArray[0]=0
                IntervalEndpointArray[0]=(-BigValue);
                IntervalEndpointArray[1]=(BigValue);
                let EDTCurrentStackPoint=0;//現在どこを指しているか
                //z,wを固定したvolumeの一次元配列を用意してここからのループのインデックス計算を削減する
                const VolumeParts=new Array(Z);
                for(let z=0;z<Z;z++){
                    VolumeParts[z]=DistanceMapVolume[(z*H+h)*W+w];
                }
                //包絡線を構築
                for(let CurrentPoint=1;CurrentPoint<Z;CurrentPoint++){
                    //新たに取り出した包絡線について、直前との包絡線との交点をチェックしていく
                    //最後の包絡線との交点を計算
                    /*
                    let LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                    let s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    while(s<=IntervalEndpointArray[EDTCurrentStackPoint]){
                        EDTCurrentStackPoint--;
                        //包絡線との交点を更新
                        LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        s=((LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint])-(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint]))/(2*(LatestEnvelopePoint-CurrentPoint));
                    }
                    */
                    let s;
                    while(true){
                        const LatestEnvelopePoint=EnvelopeArray[EDTCurrentStackPoint];
                        const num=(CurrentPoint*CurrentPoint+VolumeParts[CurrentPoint])-(LatestEnvelopePoint*LatestEnvelopePoint+VolumeParts[LatestEnvelopePoint]);
                        const den=2*(CurrentPoint-LatestEnvelopePoint);
                        s=num/den;//一番最後に追加された放物線との交点
                        if(s>IntervalEndpointArray[EDTCurrentStackPoint]){
                            //この放物線は食われない
                            break;
                        }
                        //最後に追加された放物線は必要ないことがわかった
                        if(EDTCurrentStackPoint===0){//これが最後今追加された中で最後の放物線だった。
                            break;
                        }
                        EDTCurrentStackPoint--;
                    }
                    EDTCurrentStackPoint++;
                    EnvelopeArray[EDTCurrentStackPoint]=CurrentPoint;
                    IntervalEndpointArray[EDTCurrentStackPoint]=s;
                    IntervalEndpointArray[EDTCurrentStackPoint+1]=(+Infinity);
                }
                //完成した包絡線をもとにVolumeを更新
                let EnvelopeAndEndpointStackPoint=0;//最大でもW+1, Envelopeのポインタも兼任
                for(let z=0;z<Z;z++){
                    //このwがどの区間端点に属するかチェック
                    while(IntervalEndpointArray[EnvelopeAndEndpointStackPoint+1]<z){//どの左端に収まるか
                        EnvelopeAndEndpointStackPoint++;
                    }
                    //このwに使う放物線の特定が完了したので値を算出し、Volumeにその値を格納する
                    const EnvelopePoint=EnvelopeArray[EnvelopeAndEndpointStackPoint];
                    //Z方向は不均一の可能性もあるようだ
                    //とりあえずは、Pixel基準で最短距離を求めた後、これをmmに変換する
                    const diff=Index2PositionMap.get(StartZ+z)-Index2PositionMap.get(StartZ+EnvelopePoint);
                    DistanceMapVolume[(z*H+h)*W+w]=diff*diff+VolumeParts[EnvelopePoint];//(x-i)^2+f(i)
                }
            }
        }
        return DistanceMapVolume;
    }
}
/*
----------------------------------------------------------------------------------
ここまで評価指標定義エリア 
----------------------------------------------------------------------------------
*/
window.SubWindowMainProcessAPI.initializeSubWindow((event,SendingData)=>{
    EvaluateObject=new Evaluate(SendingData);
    window.SubWindowMainProcessAPI.FromMainProcessToSub((event,data)=>{
        EvaluateObject.ReceiveChangesFromMainWindow(data);
    });
});