console.log("ROISelectRenderer.js loaded");
class ROISelectClass{
    constructor(SendingData){
        this.AllROINumDisplay=document.getElementById("AllROINumDisplay");
        this.SelectedROINumDisplay=document.getElementById("SelectedROINumDisplay");
        this.RecordedROINumDisplay=document.getElementById("RecordedROINumDisplay");
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

        /*ROISelectを構成する*/
        const ROISelectContainerFragment=document.createDocumentFragment();
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
            ROISelectContainerFragment.appendChild(ROINameButton);
        }
        this.ROISelectContainer.appendChild(ROISelectContainerFragment);
        //イベント設定
        this.ElementsWithEvents=new Map();
        this.setObserverEvents();
        this.setUserEvents();
        this.setSubWindowCloseEvents();
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
            this.pressedkey.delate(e.code);
            this.FlagManager();
        });
    }
    setUserEvents(){

    }
    setSubWindowCloseEvents(){
        //メインプロセスからサブウィンドウの終了連絡がきたときの処理
        window.SubWindowMainProcessAPI.CloseSubWindowFromMainProcessToSub((event,ReceiveData)=>{
            
            const ClosingDataList=[];
            const data=new Map([
                ["OPMode",false],

                ["CanvasID",this.TargetCanvasID],
                ["Layer",this.TargetLayer],
            ])
            const ClosingData=new Map([
                ["action","ChangeOPMode"],
                ["data",data]
            ])
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
    const roiselectobj=new ROISelectClass(SendingData);
});