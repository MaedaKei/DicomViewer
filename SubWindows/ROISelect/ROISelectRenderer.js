console.log("ROISelectRenderer.js loaded");
class ROISelectClass{
    static DiffSets(SetA,SetB){//2つの集合が異なっていればTrue
        if(SetA.size!==SetB.size){
            return true;
        }
        for(const sa of SetA){
            if(!SetB.has(sa)){
                return true;
            }
        }
        return false;
    }
    constructor(SendingData){
        this.AllROINumDisplay=document.getElementById("AllROINumDisplay");
        this.SelectedROINumDisplay=document.getElementById("SelectedROINumDisplay");
        this.MemorizedROINumDisplay=document.getElementById("MemorizedROINumDisplay");
        this.ROISelectContainer=document.getElementById("ROISelectContainer");

        const ReceivedDataBody=SendingData.get("data");
        this.TargetCanvasID=ReceivedDataBody.get("CanvasID");
        this.TargetLayer=ReceivedDataBody.get("Layer");
        const ROINameColorMap=ReceivedDataBody.get("ROINameColorMap");
        const ROISelectStatusSet=ReceivedDataBody.get("ROISelectStatusSet");
        const ROISelectWindowStyleMap=ReceivedDataBody.get("ROISelectWindowStyleMap");
        for(const [PropertyNameParts,value] of ROISelectWindowStyleMap.entries()){
            const PropertyName="--"+PropertyNameParts;
            const SetValue=value;
            document.documentElement.style.setProperty(PropertyName,SetValue);
        }
        this.AllROINum=ROINameColorMap.size;
        this.AllROINumDisplay.textContent=`All ${this.AllROINum}`;
        this.ROISelectStatusSet=ROISelectStatusSet;
        this.SelectedROINum=this.CountSelectedROINum();//Displayも更新
        this.ROIMemoryStatusSet=new Set(ROISelectStatusSet);//デフォルトではウィンドウオープン時の選択状態が記憶される
        this.MemorizedROINum=this.CountMemorizedROINum();//Displayも更新
        /*ROISelectを構成する*/
        const ROISelectContainerFragment=document.createDocumentFragment();
        this.ROIButtonMap=new Map();
        for(const [ROIName,ColorHex] of ROINameColorMap){
            const ROINameButton=document.createElement("button");
            ROINameButton.className="ROINameButton";
            ROINameButton.value=ROIName;
            ROINameButton.tabIndex=-1;//Tabによるフォーカスを禁止
            const ButtonFragment=document.createDocumentFragment();

            const ROIColorBoxSpan=document.createElement("span");
            ROIColorBoxSpan.className="ROIColorBoxSpan";
            ROIColorBoxSpan.style.backgroundColor=ColorHex;
            const ROINameSpan=document.createElement("span");
            ROINameSpan.className="ROINameSpan";
            ROINameSpan.textContent=ROIName;

            ButtonFragment.appendChild(ROIColorBoxSpan);
            ButtonFragment.appendChild(ROINameSpan);
            ROINameButton.appendChild(ButtonFragment);
            if(this.ROISelectStatusSet.has(ROIName)){
                ROINameButton.classList.add("Selected");
            }
            ROISelectContainerFragment.appendChild(ROINameButton);
            this.ROIButtonMap.set(ROIName,ROINameButton);//一括変更時に有効活用できる
        }
        this.ROISelectContainer.appendChild(ROISelectContainerFragment);
        //MultiUseLayerMode申請
        this.SendMultiUseLayerSwitching(this.TargetCanvasID,"CONTOURROIClickModeSwitchingFunction",true);//ラッパー
        //イベント設定
        this.FromMainProcessToSubFunctions=new Map();
        this.ElementsWithEvents=new Map();
        this.setObserverEvents();
        this.setUserEvents();
        this.setSubWindowCloseEvents();
    }
    SendMultiUseLayerSwitching(TargetCanvasID,ModeSwitching,Activate){
        const FromSubToMainProcessData=new Map([
            ["action",ModeSwitching],
            ["data",new Map([
                ["CanvasID",TargetCanvasID],
                ["Activate",Activate]
            ])]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    CountSelectedROINum(){
        this.SelectedROINum=this.ROISelectStatusSet.size;
        //InfoDisplayも更新する
        this.SelectedROINumDisplay.textContent=`S ${this.SelectedROINum}`;
    }
    CountMemorizedROINum(){
        this.MemorizedROINum=this.ROIMemoryStatusSet.size;
        this.MemorizedROINumDisplay.textContent=`M ${this.MemorizedROINum}`;
    }
    FlagManager(){
        const Controlpressed=(this.pressedkey.get("ControlLeft")||this.pressedkey.get("ControlRight"));
        /*Spaceキーによる全選択・リセットボタン*/
        if(!Controlpressed){
            this.AllAndResetFlag=true;
        }else{
            this.AllAndResetFlag=false;
        }
        /*
        メモリー機能
        1. メモリー上書き　Ctrl押下時のみ
        2. メモリー読み出し　押してないとき
        */
        if(Controlpressed){
            //上書きON読み出しOFF
            this.MemoryWriteFlag=true;
        }else{
            //上書きOFF読み出しON
            this.MemoryWriteFlag=false;
        }
    }
    setObserverEvents(){
        /*
        documentに対して監視を行う
        Ctrlが押されているかで挙動を変える機能がある。
        マウストラックはしない
        */
        this.pressedkey=new Map();
        this.EventSetHelper(document,"keydown",(e)=>{
            this.pressedkey.set(e.code,true);
            this.FlagManager();
        });
        this.EventSetHelper(document,"keyup",(e)=>{
            this.pressedkey.delete(e.code);
            this.FlagManager();
        });
    }
    setUserEvents(){
        this.setROISelectChange();
        this.setAllAndReset();
        this.setROISelectMemory();
        this.ROIClickStatusSet=new Map();
        //クリックされたROINameSetを受信する
        const CONTOURROIClickedFunction=(data)=>{
            //前回のクリックされたROINameをループして、ClickPointsInROIAreaクラスを消す
            /*
            console.log(this.ROIClickStatusSet);
            for(const ROIName of this.ROIClickStatusSet){
                const ROIButton=this.ROIButtonMap.get(ROIName);
                ROIButton.classList.remove("ClickPointsInROIArea");
            }
            */
            //ROIClickStatusSetを更新する
            //ClickPointsInROIAreaこのクラスは、SelectROIが一つでも変わるタイミングですべて消す
            this.RemoveClickPointsInROIAreaClass();//button要素からクラスを削除する関数
            const ReceiveDataBody=data.get("data");
            this.ROIClickStatusSet=ReceiveDataBody.get("ClickedROISet");
            console.log(this.ROIClickStatusSet);
            for(const ROIName of this.ROIClickStatusSet){
                const ROIButton=this.ROIButtonMap.get(ROIName);
                ROIButton.classList.add("ClickPointsInROIArea");
            }
        }
        this.FromMainProcessToSubFunctions.set("CONTOURROIClicked",CONTOURROIClickedFunction);
    }
    RemoveClickPointsInROIAreaClass(){
        //this.ROIClickStatusSetをもとに消して、this.ROIClickStatusSetをリセット
        for(const ROIName of this.ROIClickStatusSet){
            const ROIButton=this.ROIButtonMap.get(ROIName);
            ROIButton.classList.remove("ClickPointsInROIArea");
        }
        this.ROIClickStatusSet.clear();//一応初期化する
    }
    setROISelectChange(){
        /*ROISelectContainerにイベントを付ける*/
        /*ユーザーが一つずつROIを選ぶときに限り、ROIのSelected解除に合わせてClickPointsROIAreaを解除する*/
        this.EventSetHelper(this.ROISelectContainer,"mouseup",(e)=>{
            if(e.button===0){
                const ClickedButton=e.target.closest("button.ROINameButton");
                if(ClickedButton){
                    //console.log(ClickedButton);
                    /*押されたボタンがSelectedの状態にあるかどうかを確認する*/
                    const SelectedROIName=ClickedButton.value;
                    if(ClickedButton.classList.contains("Selected")){
                        //属する場合、解除する
                        ClickedButton.classList.remove("Selected");
                        //StatusSetからも要素を除外
                        this.ROISelectStatusSet.delete(SelectedROIName);
                        //ClickPointsInROIAreaはSelectが解除されるタイミングで一緒に解除する
                        ClickedButton.classList.remove("ClickPointsInROIArea");
                        this.ROIClickStatusSet.remove(SelectedROIName);
                    }else{
                        //ない場合
                        ClickedButton.classList.add("Selected");
                        this.ROISelectStatusSet.add(SelectedROIName);
                    }
                    //要素数を更新
                    this.CountSelectedROINum();
                    //StatusSetをMainWindowに送信する
                    this.SendROISelectStatusSet();//ラッパー
                }
            }
        });
    }
    setAllAndReset(){
        /*スペースキーの押下時に全選択・リセットを行う*/
        this.AllAndResetFlag=true;
        this.EventSetHelper(document,"keydown",(e)=>{
            if(this.AllAndResetFlag&&e.code==="Space"){
                //全ROI数と現在の選択数を比較する
                if(this.AllROINum===this.SelectedROINum){
                    //全選択状態なので全てをリセットする
                    for(const ROIButton of this.ROIButtonMap.values()){
                        ROIButton.classList.remove("Selected");
                    }
                    this.ROISelectStatusSet.clear();
                }else{
                    //全選択状態ではないので全選択にする
                    for(const [ROIName,ROIButton] of this.ROIButtonMap.entries()){
                        ROIButton.classList.add("Selected");
                        this.ROISelectStatusSet.add(ROIName);
                    }
                }
                //切り替わるのでClickPointsInROIAreaをすべて削除する
                this.RemoveClickPointsInROIAreaClass();
                this.CountSelectedROINum();
                this.SendROISelectStatusSet();
            }
        });
    }
    setROISelectMemory(){
        this.MemoryWriteFlag=false;//
        this.EventSetHelper(document,"keydown",(e)=>{
            if(e.code==="KeyM"){
                if(this.MemoryWriteFlag){
                    //現在のROISelectStatusSetに保存
                    this.ROIMemoryStatusSet=new Set(this.ROISelectStatusSet);//参照独立
                    this.CountMemorizedROINum();
                }else{
                    //ROISelectStatusとROIMemoryStatusを比較する
                    /*
                    2つの集合が同じならそれらを消す
                    2つの集合が違うなら更新する
                    */
                    //どちらのせよ、ボタンのSelectは一度解除してもよい
                    for(const SelectedROIName of this.ROISelectStatusSet){
                        const SelectedROIButton=this.ROIButtonMap.get(SelectedROIName);
                        SelectedROIButton.classList.remove("Selected");
                    }
                    if(ROISelectClass.DiffSets(this.ROISelectStatusSet,this.ROIMemoryStatusSet)){
                        //2つの集合が違うなら更新して再描画
                        for(const MemorizedROIName of this.ROIMemoryStatusSet){
                            const MemorizedROIButton=this.ROIButtonMap.get(MemorizedROIName);
                            MemorizedROIButton.classList.add("Selected");
                        }
                        this.ROISelectStatusSet=new Set(this.ROIMemoryStatusSet);
                    }else{
                        //2つの集合が同じならMemory読み込みによって選択された盤面なので、これを全消去する
                        this.ROISelectStatusSet.clear();
                    }
                    this.RemoveClickPointsInROIAreaClass();
                    this.CountSelectedROINum();
                    this.SendROISelectStatusSet();
                }
            }
        });
    }
    PassChangesToMainWindow(data){
        window.SubWindowMainProcessAPI.FromSubToMainProcess(data);
    }
    SendROISelectStatusSet(){
        //データを作成して送信する
        const data=new Map([
            ["ROISelectStatusSet",this.ROISelectStatusSet],

            ["CanvasID",this.TargetCanvasID],
            ["Layer",this.TargetLayer]
        ]);
        const FromSubToMainProcessData=new Map([
            ["action","ChangeROISelectStatus"],
            ["data",data]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    ReceiveChangesFromMainWindow(data){
        const bodyaction=data.get("action");
        console.log(bodyaction);
        this.FromMainProcessToSubFunctions.get(bodyaction)(data);
    }
    setSubWindowCloseEvents(){
        //メインプロセスからサブウィンドウの終了連絡がきたときの処理
        window.SubWindowMainProcessAPI.CloseSubWindowFromMainProcessToSub((event,ReceiveData)=>{
            const ClosingDataList=[];
            const ClosingData=new Map([
                ["action","CONTOURROIClickModeSwitchingFunction"],
                ["data",new Map([
                    ["CanvasID",this.TargetCanvasID],
                    ["Activate",false]
                ])]
            ]);
            ClosingDataList.push(ClosingData);
            window.SubWindowMainProcessAPI.CloseSubWindowFromSubToMainProcess(ClosingDataList);
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
window.SubWindowMainProcessAPI.initializeSubWindow((event,SendingData)=>{
    const ROISelectobj=new ROISelectClass(SendingData);
    //MainWindouとの双方向通信のリスナー設置
    window.SubWindowMainProcessAPI.FromMainProcessToSub((event,data)=>{
        ROISelectobj.ReceiveChangesFromMainWindow(data);
    });
});