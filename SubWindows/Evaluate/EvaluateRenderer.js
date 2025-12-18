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
        this.CanvasSelectButtonContainer=document.getElementById("CanvasSelectButtonContainer");
        this.InputSelectDialogCloseButton=document.getElementById("InputSelectDialogCloseButton");
        //領域選択入力欄
        this.LeftTopXInput=document.getElementById("LeftTopXInput");
        this.LeftTopYInput=document.getElementById("LeftTopYInput");
        this.RectangleWidthInput=document.getElementById("RectangleWidthInput");
        this.RectangleHeightInput=document.getElementById("RectangleHeightInput");
        this.StartSliceInput=document.getElementById("StartSliceInput");
        this.EndSliceInput=document.getElementById("EndSliceInput");
        
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
        this.DataTypeCanvasIDMap=ReceivedDataBody.get("DataTypeCanvasIDMap");
        this.LayoutGridMap=ReceivedDataBody.get("LayoutGridMap");
        this.CanvasID2GridNumberMap=ReceivedDataBody.get("CanvasID2GridNumberMap");
        console.log(this.DataTypeCanvasIDMap);
        /*
        //無効のデータを入れておく
        this.DataTypeCanvasIDMap.set(this.InvalidDataType,new Map([
            [this.InvalidCanvasID,this.InvalidDataID]
        ]));
        */
        /*各要素に値を突っ込んでいく*/
        //関数選択機能の設定
        //評価関数の登録
        this.EvaluationFunctionMap=new Map([
            [VolumetricDSC.EvaluateName,new VolumetricDSC()],
            [dammyFunction.EvaluateName,new dammyFunction()],
        ]);
        //一応一つ前の評価関数名を保持しておく
        this.PreviousSelectedFunctionName=false;
        //関数セレクト周辺への反映
        this.EvaluationFunctionSelecter.innerHTML="";
        this.TargetDataTypeDisplay.innerHTML="";
        this.InputNumDisplay.innerHTML="";
        for(const EvaluateName of this.EvaluationFunctionMap.keys()){
            const option=document.createElement("option");
            option.value=EvaluateName;
            option.text=EvaluateName;
            this.EvaluationFunctionSelecter.appendChild(option);
        }
        //一番最初に追加した要素をデフォルト選択とする
        this.EvaluationFunctionSelecter.selectedIndex=0;
        //OFFにする時に必要になる
        //その他でも必要になることになったので、Selecterの選択変化時にCanvasID,Layer=DataType,DataIDを保持させる
        //CIDとターゲットレイヤーをセットで保持する
        //{SelectのID:"CanvasID:Invalid"}
        this.PreviousSelectedCID=new Map(
            Array.from(this.InputBlockSelecterMap.keys()).map((SelecterID)=>{
                return [SelecterID,new Map([
                    ["CanvasID",this.InvalidCanvasID],
                    ["Layer",this.InvalidDataType],
                    ["DataID",this.InvalidDataID],
                ])];
            })
        );
        //MainWindowから送られてきたデータを保持しておいて、繰り返し使うところ
        //入力が2つまでしかないので、現時点では2つのみストックする
        //{CID:Volume}
        /*
        this.VolumeStock=new Map([
            [-10,null],
            [-20,null]
        ]);
        */
        //Stockは入力セレクターの個数分保持する
        const NumList=Array.from({length:this.InputBlockSelecterMap.size},(_,i)=>(i+1)*(-10));
        //VolumeStockのkeyはDataType:DataIDとする
        this.VolumeStock=new Map(
            NumList.map((dammyDataID)=>{
                const dammyDataTypeDataIDKey=Evaluate.Array2String([this.InvalidDataType,dammyDataID]);
                return [dammyDataTypeDataIDKey,null];
            })
        );
        this.originalimagewidth=99999;
        this.originalimageheight=99999;
        this.originalslidermax=99999;
        this.ChangeFunctionSelect();
        this.UpdateInputSelectDialog();
        //イベントの登録
        this.ElementsWithEvents=new Map();
        this.setUserEvents();
        this.setSubWindowCloseEvents();
    }
    //DataTypeCanvasIDMapを設定する用の内部メソッド
    //リアルタイム変更に今後対応するかもしれないのでメソッドとしておく
    setUserEvents(){
        this.FromMainProcessToSubFunctions=new Map();
        //評価指標選択
        this.EventSetHelper(this.EvaluationFunctionSelecter,"change",(e)=>{
            //const SelectedFunctionName=e.target.value;
            this.ChangeFunctionSelect();
        });
        //インプット選択
        const InputCIDChangeFunction=(e)=>{
            const key=e.target.id;//SelecterのIDがPreviouSelectedCIDのKeyでもある
            let OFFCIDLayerMap=this.PreviousSelectedCID.get(key);//{CanvasID:,Layer:,DataID}
            const ONCID=parseInt(e.target.value);//CanvasID
            /*
            ONCIDが選択無効の値かどうかで場合分けする。DataTypeCanvasIDMapに無効選択をあらかじめ作ることで入力欄に不要な選択肢が増えてしまったため
            仕方なくif文を使用する
            */
            const ONCIDLayerMap=new Map([
                ["CanvasID",ONCID],
                ["Layer",this.InvalidDataType],
                ["DataID",this.InvalidDataID]
            ]);
            if(ONCID>=0){
                const SelectedFunctionName=this.PreviousSelectedFunctionName;
                const ONDataType=this.EvaluationFunctionMap.get(SelectedFunctionName).TargetDataType;//DataType
                const ONDataID=this.DataTypeCanvasIDMap.get(ONDataType).get(ONCID);
                ONCIDLayerMap.set("Layer",ONDataType);
                ONCIDLayerMap.set("DataID",ONDataID);
            }
            //console.log(key,OFFCID,ONCID);
            this.PreviousSelectedCID.set(key,ONCIDLayerMap);
            //ラッパーによりデータを送信
            //OFFとなるCIDが別の入力で選択されている場合、それは送信しない。無効データとする
            //まずはCIDのリストを作成
            const SelectedCIDList=Array.from(this.PreviousSelectedCID.values().map((CIDLayerMap)=>{
                const CanvasID=CIDLayerMap.get("CanvasID");
                return CanvasID;
            }));
            //console.log(SelectedCIDList);
            //次に、CIDリストにOFFCIDが含まれているかチェック
            if(SelectedCIDList.includes(OFFCIDLayerMap.get("CanvasID"))){
                OFFCIDLayerMap=new Map([
                    ["CanvasID",this.InvalidCanvasID],
                    ["Layer",this.InvalidDataType],
                    ["DataID",this.InvalidDataID],
                ]);
            }
            //console.log(ONCIDLayerMap);
            //console.log(OFFCIDLayerMap);
            this.SendTargetCanvasChange(OFFCIDLayerMap,ONCIDLayerMap);
        }
        for(const InputBlockSelecter of this.InputBlockSelecterMap.values()){
            this.EventSetHelper(InputBlockSelecter,"change",InputCIDChangeFunction);
        }
        //インプットの変更をMainWindowに通知後、あちらからサイズに関する情報が送られてくるので受け取る
        const FromMainToSubCanvasSizeFunction=(data)=>{
            const ReceiveDataBody=data.get("data");
            const originalimagewidth=ReceiveDataBody.get("originalimagewidth");
            const originalimageheight=ReceiveDataBody.get("originalimageheight");
            const originalslidermax=ReceiveDataBody.get("originalslidermax");
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
        this.DataLoadStatus=new Map([
            ["NoLoad",[]],//DataType:DataIDという文字列が入る
            ["Load",[]]
        ]);
        this.EventSetHelper(this.CalculateConfirmButton,"mouseup",(e)=>{
            if(e.button==0){
                //console.log("計算開始");
                //要求されているCIDと現在ストックされているCIDを調査
                //ストックはMainWindowからデータをもらった時に上書きされる
                //とりあえず選択されている関数の入力数を気にせずやってみる
                this.DataLoadStatus.set("NoLoad",[]);
                this.DataLoadStatus.set("Load",[]);
                const NoLoadDataList=this.DataLoadStatus.get("NoLoad");
                const LoadDataList=this.DataLoadStatus.get("Load");
                const CurrentStockedDataList=Array.from(this.VolumeStock.keys());
                /*
                Selecterの選択状況を確認する
                Selecterの変化は逐一監視し、PreviouSelectedCIDにCanvasID,Layer,DataIDを保持しているので
                それを参照すればよい
                */
                /*
                for(const InputBlockSelecter of this.InputBlockSelecterMap.values()){
                    const SelectedDataTypeDataID=parseInt(InputBlockSelecter.value);
                    if(CurrentStockedDataList.includes(SelectedDataTypeDataID)){
                        //ストックにあるから読み込まなくてOK
                        NoLoadDataList.push(SelectedDataTypeDataID);
                    }else{
                        //ストックにないから読み込み必要
                        LoadDataList.push(SelectedDataTypeDataID);
                        //CurrentStockedCIDsを更新して仮想的に読み込まれたことにする
                        CurrentStockedDataList.push(SelectedData);
                    }
                }
                */
                //入力の走査を関数が欲する個数に絞ってもいいかもしれない
                for(const CIDLayerMap of this.PreviousSelectedCID.values()){
                    const CanvasID=CIDLayerMap.get("CanvasID");
                    const DataType=CIDLayerMap.get("Layer");
                    const DataID=CIDLayerMap.get("DataID");
                    const DataListKey=Evaluate.Array2String([DataType,DataID]);//"DataType:DataID"
                    if(CurrentStockedDataList.includes(DataListKey)){
                        //ストックにあるので読み込まなくても大丈夫
                        NoLoadDataList.push(DataListKey);
                    }else{
                        //ストックにないので読み込み必要
                        LoadDataList.push(DataListKey);
                        CurrentStockedDataList.push(DataListKey);
                    }
                }

                //CurrentStockedCIDListとNoLoadDataList | LoadDataListの集合を比較して
                //前者の要素の中で後者に含まれていないCIDのストックを削除する
                //ただし、この処理は新しくLoadする必要があるときのみ行う
                //また、削除する個数は読み込む個数と一致させる
                //例えば、[2,3]から[1,1]=[1]を読み込むとき、[2,3]両方消すのではなく該当するCIDを先頭から個数分だけ削除する
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
                //MainWindowにLoadDataListのデータを要求
                this.SendTargetDataList(LoadDataList);//ラッパー
            }
        });
        //2.データ受け取り→計算
        //listitemをフォーカスしたときにデータの送信が起こるが、なるべく無用な送信は控えたいので新しく計算した結果に自動フォーカスするときは送信が起こらないようにFlagで管理する
        //this.ListItemClickedTransmission=false;
        const FromMainToSubTargetVolumeFunction=(data)=>{
            const ReceiveDataBody=data.get("data");
            const VolumeMap=ReceiveDataBody.get("VolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}
            const extradatamap=ReceiveDataBody.get("extradata");
            //SelectArea, input順のvolume, を関数に送る
            //console.log("イメージボリューム受信");
            //console.log(Array.from(VolumeMap.keys()));
            //VolumeStockに格納する
            for(const [datakey,volumemap] of VolumeMap.entries()){
                //datakey="DataType:DataID"
                this.VolumeStock.set(datakey,volumemap);//volumemapは{datakey:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}
            }
            //評価関数に渡す用のデータを成形
            //CalculateID,VolumeMap,SelectedAreaの3つを渡す
            //CanvasID,DataType,DataIDの情報もまとめて渡す
            const EvaluationFunctionName=this.PreviousSelectedFunctionName;
            const EvaluationFunction=this.EvaluationFunctionMap.get(EvaluationFunctionName);
            const InputNum=EvaluationFunction.InputNum;
            const InputVolumeMap=new Map();//{volume1:volume,volume2:volume...}
            //const InputBlockSelecterList=Array.from(this.InputBlockSelecterMap.values());
            const PreviouseInputInfoList=Array.from(this.PreviousSelectedCID.values());//{CanvasID,Layer,DataID}のMapのリスト
            const InputInfoList=[];
            const InputCIDList=[];//履歴用
            for(let i=0;i<InputNum;i++){
                //InputVolumeMapにボリューム自体の本来の大きさを表すデータが必須である。
                //深さの情報は必要ないが、widthとheightの最大値がないと選択エリアから正しいインデックス算出ができない
                const PreviousInputInfo=PreviouseInputInfoList[i];
                const InputVolumeMapKey=Evaluate.Array2String([PreviousInputInfo.get("Layer"),PreviousInputInfo.get("DataID")]);
                InputVolumeMap.set(InputVolumeMapKey,this.VolumeStock.get(InputVolumeMapKey));//複数入力で同じCIDを選択した場合、ここは入力個数と一致しなくなる
                InputInfoList.push(PreviousInputInfo);
                InputCIDList.push(PreviousInputInfo.get("CanvasID"));
            }
            const CalculateID=this.CalculateID;
            this.CalculateID++;//IDの更新
            //SelectedAreaの成形
            const SelectedArea=new Map([
                ["w0",parseInt(this.LeftTopXInput.value)],
                ["h0",parseInt(this.LeftTopYInput.value)],
                ["width",parseInt(this.RectangleWidthInput.value)],
                ["height",parseInt(this.RectangleHeightInput.value)],
                ["startslice",parseInt(this.StartSliceInput.value)],
                ["endslice",parseInt(this.EndSliceInput.value)],
            ]);
            const CalculateData=new Map([
                ["CalculateID",CalculateID],
                ["SelectedArea",SelectedArea],
                ["InputInfoList",InputInfoList],//各セレクターの選択情報
                ["InputVolumeMap",InputVolumeMap],//実際に必要になるボリュームを送る。複数のセレクターが同じものを選択した場合、個数はセレクターよりも少なくなる
                /*
                MainWindow側で新しくデータを送るときに一緒に入ってくるため,
                場合によってはundifinedの可能性ある。関数側で存在判定する必要がある.
                というか、DataTypeによっては空のときもあるから普通に存在判定したほう安全
                */
                ["extradata",extradatamap],
            ]);
            //console.log("これで計算\n",CalculateData);
            EvaluationFunction.Calculate(CalculateData);
            //CalculateHistoriListに要素を追加
            const ListItem=document.createElement("li");
            ListItem.className="CalculateHistoryListItem";
            ListItem.setAttribute("data-FunctionName",EvaluationFunctionName);
            ListItem.setAttribute("data-CalculateID",CalculateID);
            //CalculateID, FunctionName, Input名を表示する
            const CalculateIDArea=document.createElement("div");
            CalculateIDArea.className="CalculateHistoryListItemIDArea";
            CalculateIDArea.textContent=CalculateID;
            const FunctionNameArea=document.createElement("div");
            FunctionNameArea.className="CalculateHistoryListItemFunctionNameArea";
            FunctionNameArea.textContent=EvaluationFunctionName;
            const InputCIDArea=document.createElement("div");
            InputCIDArea.className="CalculateHistoryListItemInputCIDArea";
            InputCIDArea.textContent=`[ ${InputCIDList.join(",")} ]`;
            ListItem.appendChild(CalculateIDArea);
            ListItem.appendChild(FunctionNameArea);
            ListItem.appendChild(InputCIDArea);
            this.CalculateHistoryList.appendChild(ListItem);
            //追加したリストアイテムにFocusを当てて結果を表示する
            const scrollHeight=this.CalculateHistoryList.scrollHeight;
            this.CalculateHistoryList.scrollTop=scrollHeight;
            //ここでのFocusでは送信を起こしたくない
            this.FocusHistoryListItem(CalculateID,false);
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
        /*GridInfomation, DataTypeCanvasIDMap*/
        const UpdateMainWindowStatusFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            this.DataTypeCanvasIDMap=ReceivedDataBody.get("DataTypeCanvasIDMap");
            this.LayoutGridMap=ReceivedDataBody.get("LayoutGridMap");
            this.CanvasID2GridNumberMap=ReceivedDataBody.get("CanvasID2GridNumberMap");
            this.UpdateInputSelectDialog();
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
            const map1=Array.from(SelectedFunction.CalculateHistory.keys());
            //console.log(typeof(map1[0]),map1[0]);
            //console.log(typeof(CalculateID),CalculateID);
            const history=SelectedFunction.CalculateHistory.get(CalculateID);
            const SelectedAreaData=history.get("SelectedArea");
            const InputInfoList=history.get("InputInfoList");//Map
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
                this.EvaluationFunctionSelecter.dispatchEvent(new Event("change"));
                //2. InputCIDを反映
                //評価時に有効だった入力個数分だけ順番に変更する
                const InputBlockSelecterList=Array.from(this.InputBlockSelecterMap.values());//indexでアクセスするため
                for(let i=0;i<InputInfoList.length;i++){
                    const InputInfo=InputInfoList[i];
                    const InputCID=InputInfo.get("CanvasID");
                    const ChangeTargetCIDSelecter=InputBlockSelecterList[i];
                    ChangeTargetCIDSelecter.value=InputCID;
                    ChangeTargetCIDSelecter.dispatchEvent(new Event("change"));
                }
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
            const ResultDomTree=SelectedFunction.FocusResult(CalculateID);//イベント設定用にthisも渡す
            this.ResultContainer.innerHTML="";
            this.ResultContainer.appendChild(ResultDomTree);
        }
    }
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
    ChangeFunctionSelect(){
        //関数に関する情報と入力候補を変更する
        const NewSelectedFunctionName=this.EvaluationFunctionSelecter.value;
        const NewSelectedFunction=this.EvaluationFunctionMap.get(NewSelectedFunctionName);
        const NewTargetDataType=NewSelectedFunction.TargetDataType;
        const NewInputNum=NewSelectedFunction.InputNum;

        this.TargetDataTypeDisplay.textContent=`Target : ${NewTargetDataType}`;
        this.InputNumDisplay.textContent=`Input x ${NewSelectedFunction.InputNum}`;
        //古い情報を保持(初回実行時などはないときもある)
        let OldSelectedFunctionName=this.PreviousSelectedFunctionName;
        let OldSelectedFunction=false;
        let OldTargetDataType=false
        let OldInputNum=false;
        if(OldSelectedFunctionName&&this.EvaluationFunctionMap.has(OldSelectedFunctionName)){
            OldSelectedFunction=this.EvaluationFunctionMap.get(OldSelectedFunctionName);
            OldTargetDataType=OldSelectedFunction.TargetDataType;
            OldInputNum=OldSelectedFunction.InputNum;
        }

        const TargetDataTypeChangedFlag=(OldTargetDataType!==NewTargetDataType);
        /*入力セレクターの初期化*/
        //選択状態の解除(MainWindow側への送信が発生する)
        //選択候補の初期化を行う
        /*
        処理の仕様
        データタイプが変わる場合または入力数から漏れた場合、オプションの初期化及び選択状態の解除が行われる
        */
        const InputBlockSelecterArray=Array.from(this.InputBlockSelecterMap.entries());//SelecterElementのArray
        const PreviousSelectedCIDMapArray=Array.from(this.PreviousSelectedCID.entries());//[{"CanvasID":,"Layer":,"DataID":},...]
        //SelecterElementの個数とPreviousSelectedCIDMapの個数は一致するはずent
        const SelecterNum=InputBlockSelecterArray.length;
        if(SelecterNum!==PreviousSelectedCIDMapArray.length){
            throw new Error("(評価関数変更)InputSelecterとPreviousSelectedCIDMapの個数が違う");
        }
        const TargetCIDMap=this.DataTypeCanvasIDMap.get(NewTargetDataType);//新しく選択された関数の入力対象となるCanasID:DataIDのマップ{CanvasID:DataID,...,}
        for(let SelecterIndex=0;SelecterIndex<SelecterNum;SelecterIndex++){
            const [InputBlockSelecterKey,InputBlockSelecter]=InputBlockSelecterArray[SelecterIndex];
            /*データタイプが変わっているならOptionを更新*/
            let OptionChangedFlag=false;
            if(TargetDataTypeChangedFlag){
                /*Selecterのoptionの初期化*/
                InputBlockSelecter.innerHTML="";
                const initialoption=document.createElement("option");
                initialoption.text="--";
                initialoption.value=this.InvalidCanvasID;
                //initialoption.disabled=true;
                //initialoption.hidden=true;
                initialoption.selected=true;
                InputBlockSelecter.appendChild(initialoption);
                for(const [CanvasID,DataID] of TargetCIDMap.entries()){
                    const option=document.createElement("option");
                    option.text=`CID: ${CanvasID}`;
                    //この時点で各選択肢のCID,DataType,がわかるのでDataIDも特定可能
                    //よって、選択肢のvalueはDataType：DataIDとする
                    option.value=CanvasID;//Select時にもろもろの情報をまとめることにする
                    InputBlockSelecter.appendChild(option);
                }
                OptionChangedFlag=true;
            }
            /*評価関数の入力数に含まれるか*/
            /*
            const InputDisabledFlag=!(SelecterIndex<NewInputNum);
            InputBlockSelecter.disabled=InputDisabledFlag;
            */
            let InputDisabledFlag=null;
            const InputBlockLabel=this.InputBlockLabelList[SelecterIndex];
            if(SelecterIndex<NewInputNum){
                InputBlockSelecter.disabled=false;
                InputBlockLabel.classList.remove("DisabledLabel");
                InputDisabledFlag=false;
            }else{
                InputBlockSelecter.disabled=true;
                InputBlockLabel.classList.add("DisabledLabel");
                InputDisabledFlag=true;
            }
            /*オプションの初期化、またはセレクタの無効化が行われたとき、このInputBlockSelecterがさしていたCanvasIDに対してMultiUseLayerModeをfalseにするよう送信する*/
            //OFF⇒それまでのCanvasID、ON⇒無効CanvasID
            if(OptionChangedFlag||InputDisabledFlag){
                const [PreviouseSelectedCIDMapKey,PreviousSelectedCIDMap]=PreviousSelectedCIDMapArray[SelecterIndex];//このセレクターの、それまでの選択状態{"CanvasID":,"Layer":,"DataID":}
                const PreviousCanvasID=PreviousSelectedCIDMap.get("CanvasID");
                if(PreviousCanvasID>=0){//有効なCanvasIDが選択されていたら送信する
                    const DammyONCIDLayerMap=new Map([
                        ["CanvasID",this.InvalidCanvasID],
                        ["Layer",this.InvalidDataType],
                        ["DataID",this.InvalidDataID]
                    ]);
                    const OFFCIDLayerMap=PreviousSelectedCIDMap;//名前の命名規則がずれている
                    const TargetCID=new Map([
                        ["ON",DammyONCIDLayerMap],
                        ["OFF",OFFCIDLayerMap]
                    ]);
                    const SendingData=new Map([
                        ["action","ChangeTargetCanvas"],
                        ["data",new Map([
                            ["TargetCID",TargetCID],
                            ["SelectedArea",null]
                        ])]
                    ]);
                    //MainWindowに送信
                    this.PassChangesToMainWindow(SendingData);
                    //PreviousSelectedCIDを更新
                    this.PreviousSelectedCID.set(PreviouseSelectedCIDMapKey,DammyONCIDLayerMap);//参照型だから元のほうにも変更反映されるはず
                }
            }
        }

        //CIDの選択が初期状態に戻るので範囲選択も同様に初期値は全て0とする
        //データタイプが変わった場合のみ選択範囲の初期化を行う
        //初期データから値をセット
        if(TargetDataTypeChangedFlag){//データタイプが変わっているので選択範囲も初期化
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
        
        //新しく選択された保持しておく
        this.PreviousSelectedFunctionName=NewSelectedFunctionName;
    }
    UpdateInputSelectDialog(){//選択する関数が変わったときと、MainWindowに動きがあったときに呼ばれる
        /*DataTypeCanvasIDMap,CanvasID2GridNumber、GridSizeをもとにダイアログをメインウィンドウと同じ構成に更新する*/
        
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

    SendSelectedArea(){//ラッパー
        const SelectedArea=new Map([
            ["w0",parseInt(this.LeftTopXInput.value)],
            ["h0",parseInt(this.LeftTopYInput.value)],
            ["width",parseInt(this.RectangleWidthInput.value)],
            ["height",parseInt(this.RectangleHeightInput.value)],
            ["startslice",parseInt(this.StartSliceInput.value)],
            ["endslice",parseInt(this.EndSliceInput.value)],
        ]);
        for(const CIDLayerMap of this.PreviousSelectedCID.values()){
            const targetCID=CIDLayerMap.get("CanvasID");
            if(targetCID>=0){//未選択CIDは-99999
                //そのうち変更を加えたキャンバス自身にはこの変更を送らないようにするかも
                //ただし、送信回数が一回減るだけなので、送信の負荷がそこまで大きくないならその変更はいらないかも
                const SendingData=new Map([
                    ["action","ChangeCanvasesSelectedArea"],
                    ["data",new Map([
                        ["targetCID",targetCID],
                        ["SelectedArea",SelectedArea]
                    ])]
                ])
                this.PassChangesToMainWindow(SendingData);
            }
        }
    }
    SendTargetDataList(TargetDataList){//ラッパー
        const SendingData=new Map([
            ["action","EvaluateStart"],
            ["data",new Map([
                ["TargetDataList",TargetDataList]
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
            for(const CIDLayerMap of this.PreviousSelectedCID.values()){
                //有効なCIDが選択されているものだけ送信する
                const CanvasID=CIDLayerMap.get("CanvasID");
                if(CanvasID>=0){//未選択状態のものは送らない
                    const Layer=CIDLayerMap.get("Layer");
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

/*--- ここから評価指標定義エリア ----------------------------------------------------------------------------------*/

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
class dammyFunction{
    static EvaluateName="dammy";
    constructor(){
        this.InputNum=1;
        this.TargetDataType="CT";
        this.CalculateHistory=new Map();
    }
}
class VolumetricDSC{
    static EvaluateName="VolumetricDSC";
    constructor(){
        //名前。基本的には自身のクラス名を名前とする
        //this.EvaluatonName=this.constructor.name
        this.InputNum=2;
        this.TargetDataType="MASK";
        this.CalculateHistory=new Map();//{ID:{Result,SelectedArea}}

        this.setResultTemplate();
        this.setUserEvents();
    }
    setResultTemplate(){
        this.VolumetricDSCResultContainer=document.createElement("div");
        this.VolumetricDSCResultContainer.id="VolumetricDSCResultContainer";
        /*InfoText部はテンプレートとして持っておく*/
        this.InfoTextContainer=document.createElement("div");
        this.InfoTextContainer.id="VolumetricDSCInfoTextContainer";
        for(let i=0;i<this.InputNum;i++){
            const InfoText=document.createElement("div");
            InfoText.className="InfoText";
            this.InfoTextContainer.appendChild(InfoText);
        }
        this.VolumetricDSCResultContainer.appendChild(this.InfoTextContainer);
        /*tableの外枠だけは持っておく*/
        const ResultTableContainer=document.createElement("div");
        ResultTableContainer.id="VolumetricDSCResultTableContainer";
        const ResultTable=document.createElement("table");
        ResultTable.id="VolumetricDSCResultTable";
        this.TableHead=document.createElement("thead");
        this.TableHead.className="TableHead";
        this.TableBody=document.createElement("tbody");
        this.TableBody.className="TableBody";
        this.VolumetricDSCResultContainer.appendChild(ResultTableContainer);
        ResultTableContainer.appendChild(ResultTable);
        ResultTable.appendChild(this.TableHead);
        ResultTable.appendChild(this.TableBody);
    }
    setUserEvents(){
        console.log("VolumetricDSCからイベントを設定2");
        console.log(this.TableBody);
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

        const InputInfoList=structuredClone(CalculateData.get("InputInfoList"));//参照を切る。ただ代入するだけではEvaluate内のPreviousSelectedCIDまで影響することを確認した。
        const InputVolumeMap=CalculateData.get("InputVolumeMap");//{CID:{"Path",path,"Size":{width:???,height:???},"Volume":Volume}}をvalueとするMap
        const InputVolumeKeyList=InputInfoList.map((InputInfo)=>{
            const DataType=InputInfo.get("Layer");
            const DataID=InputInfo.get("DataID");
            return Evaluate.Array2String([DataType,DataID]);
        });
        for(let i=0;i<InputInfoList.length;i++){
            InputInfoList[i].set("Path",InputVolumeMap.get(InputVolumeKeyList[i]).get("Path"));
        }
        //const PathTextList=[];//入力パスをまとめるもの

        const InputVolume1=InputVolumeMap.get(InputVolumeKeyList[0]);
        const flattenvolume1=InputVolume1.get("Volume");
        const volume1OriginalWidth=InputVolume1.get("Size").get("width");
        const volume1OriginalHeight=InputVolume1.get("Size").get("height");
        //PathTextList.push(InputVolume1.get("Path"));

        const InputVolume2=InputVolumeMap.get(InputVolumeKeyList[1]);
        const flattenvolume2=InputVolume2.get("Volume");
        const volume2OriginalWidth=InputVolume2.get("Size").get("width");
        const volume2OriginalHeight=InputVolume2.get("Size").get("height");
        //PathTextList.push(InputVolume2.get("Path"));
        
        const extradata=CalculateData.get("extradata");
        
        if(extradata){//存在するときに新しく代入するよ
            this.ColorMapLabelList=extradata.get("ColorMapLabelList");//表示するときにこのラベルを使う
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
            ["InputInfoList",InputInfoList],//このメソッド内で、あらたにPathという項目をVolumeMapから非難させるような形で追加している。よって{CanvasID,Layer,DataID,Path}という感じ
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
            let vdscsum=0;
            for(let maskvalue=0;maskvalue<this.ColorMapLabelList.length;maskvalue++){
                const td=document.createElement("td");
                if(ResultMap.get("Result").has(maskvalue)){
                    const vdsc=ResultMap.get("Result").get(maskvalue);
                    td.textContent=vdsc;
                    vdscsum+=vdsc;
                    count+=1;
                }else{
                    td.textContent="";
                }
                tr.appendChild(td);
            }
            //平均欄
            const averagetd=document.createElement("td");
            averagetd.textContent=(vdscsum+1e-5)/count;
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
        const InputInfoList=FocusedResult.get("InputInfoList");
        const InfoTextList=Array.from(this.InfoTextContainer.children);
        for(let i=0;i<InputInfoList.length;i++){
            const InputInfo=InputInfoList[i];
            const CanvasID=InputInfo.get("CanvasID");
            const Path=InputInfo.get("Path");
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
        return this.VolumetricDSCResultContainer;
    }
}

/*--- ここまで評価指標定義エリア ----------------------------------------------------------------------------------*/
window.SubWindowMainProcessAPI.initializeSubWindow((event,SendingData)=>{
    EvaluateObject=new Evaluate(SendingData);
    window.SubWindowMainProcessAPI.FromMainProcessToSub((event,data)=>{
        EvaluateObject.ReceiveChangesFromMainWindow(data);
    });
});