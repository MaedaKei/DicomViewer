//CTWindowingRenderer.js
//CTWindowingのサブウィンドウのレンダラー
//ヒストグラムとCTWindowingの操作を行う
//rangeは半径とする
console.log("CTWindowingRenderer.js loaded");
class CTWindowingClass{
    constructor(SendingData){
        this.HistgramSVG=document.getElementById("HistgramSVG");//これにマウスイベントを設置する
        const HistgramPath=document.getElementById("HistgramPath");
        this.MinValueLine=document.getElementById("MinValueLine");
        this.MaxValueLine=document.getElementById("MaxValueLine");
        this.CenterValueLine=document.getElementById("CenterValueLine");
        this.RadiusValueLine=document.getElementById("RadiusValueLine");

        this.MinValueInput=document.getElementById("MinValueInput");
        this.MaxValueInput=document.getElementById("MaxValueInput");
        this.CenterValueInput=document.getElementById("CenterValueInput");
        this.RadiusValueInput=document.getElementById("RadiusValueInput");
        //this.textContainer=document.getElementById("TextContainer");
        //持っておきたい変数
        //現在の下限上限
        //現在の中央値と半径
        //オリジナルの下限上限
        //this.header=SendingData.get("header");//Mainのターゲットを特定するために使う。
        const ReceivedDataBody=SendingData.get("data");
        this.TargetCanvasID=ReceivedDataBody.get("CanvasID");
        this.TargetLayer=ReceivedDataBody.get("Layer");
        const vMin=ReceivedDataBody.get("vMin");
        const vMax=ReceivedDataBody.get("vMax");
        console.log(vMin,vMax);
        this.currentvMin=Math.min(vMin,vMax);
        this.currentvMax=Math.max(vMin,vMax);
        this.currentcenter=(this.currentvMax+this.currentvMin)/2;
        this.currentradius=(this.currentvMax-this.currentvMin)/2;
        this.MinValueInput.value=this.currentvMin;
        this.MaxValueInput.value=this.currentvMax;
        this.CenterValueInput.value=this.currentcenter;
        this.RadiusValueInput.value=this.currentradius;
        /*それぞれのキャンバスに描画*/
        /*ヒストグラム描画開始*/
        const OriginalHistgram=ReceivedDataBody.get("histgram");
        //console.log(OriginalHistgram);
        const XArray=Array.from(OriginalHistgram.keys());
        this.xmin=XArray[0];
        this.xmax=XArray[XArray.length-1];
        //console.log(this.xmin,this.xmax);
        let ymin=Infinity,ymax=-Infinity;
        const YArray=Array.from(OriginalHistgram.values()).map((OriginalY)=>{
            const ScaledY=Math.log(OriginalY+500);
            if(ymin>ScaledY){
                ymin=ScaledY;
            }
            if(ymax<ScaledY){
                ymax=ScaledY;
            }
            return ScaledY;
        });
        this.ymin=ymin;
        this.ymax=ymax;
        //内部座標大きすぎると見にくくなるのである程度圧縮する
        //viewBoxを設定
        //SVGの座標系は上から下、右から左なので、数学的な座標系に合うようにする
        //console.log(this.ymin,this.ymax);
        this.HistgramSVG.setAttribute("viewBox",`${this.xmin} ${this.ymin} ${this.xmax-this.xmin} ${this.ymax-this.ymin}`);
        //console.log(this.xmin,this.ymin,this.xmax-this.xmin,this.ymax-this.ymin);
        //console.log(this.HistgramSVG.getAttribute("viewBox"));
        const YmaxPlusYmin=this.ymax+this.ymin;
        let HistgramAttributeText=`M ${XArray[0]} ${YmaxPlusYmin-YArray[0]} `;
        for(let i=1;i<XArray.length;i++){
            const X=XArray[i];
            const Y=YmaxPlusYmin-YArray[i];
            HistgramAttributeText+=`L ${X} ${Y} `;
            ///console.log(i,HistgramPoint[1]);
        }
        HistgramPath.setAttribute("d",HistgramAttributeText);
        //各線の初期化
        this.MinValueLine.setAttribute("x1",this.currentvMin);
        this.MinValueLine.setAttribute("x2",this.currentvMin);
        this.MinValueLine.setAttribute("y1",this.ymin);
        this.MinValueLine.setAttribute("y2",this.ymax);

        this.MaxValueLine.setAttribute("x1",this.currentvMax);
        this.MaxValueLine.setAttribute("x2",this.currentvMax);
        this.MaxValueLine.setAttribute("y1",this.ymin);
        this.MaxValueLine.setAttribute("y2",this.ymax);

        this.CenterValueLine.setAttribute("x1",this.currentcenter);
        this.CenterValueLine.setAttribute("x2",this.currentcenter);
        this.CenterValueLine.setAttribute("y1",this.ymin);
        this.CenterValueLine.setAttribute("y2",this.ymax);

        this.RadiusValueLine.setAttribute("x1",this.currentvMin);
        this.RadiusValueLine.setAttribute("x2",this.currentvMax);
        this.RadiusValueLine.setAttribute("y1",(this.ymax+this.ymin)/2);
        this.RadiusValueLine.setAttribute("y2",(this.ymax+this.ymin)/2);

        //イベントとエレメントの紐づけを記録しておくMap
        this.ElementsWithEvents=new Map();
        this.setObserverEvents();
        this.setUserEvents();
        this.setSubWindowCloseEvents();
        /*
        const header=new Map([
            ["CanvasID",this.id.get("CanvasID")],
            ["Layer",targetLayer],
            ["action",action],
            ["MultiUseLayerMode",MultiUseLayerMode],
        ]);
        */
       /*
        this.FromSubToMainProcessData=new Map([
            ["header",this.header],
            ["body",new Map([["vMin",this.currentvMin],["vMax",this.currentvMax]])]
        ]);
        */
        //描画処理は一番最後
        //this.Redraw();
        //見切れないように調整
        window.SubWindowMoveAPI();
    }

    FlagManager(){
        //マウスホイールによるRadiusの操作
        //Canvas内にマウスがあればよい
        if(this.mouseenter){
            this.RadiusFlag=true;
        }else{
            this.RadiusFlag=false;
        }
        //ドラッグ＆ドロップによるCenterの操作
        //curretnvminとcurrentvmaxの間にマウスがあればよい
        //マウスが右クリックされている間
        //押された瞬間に条件を満たしていれば話すまでは動作するものとする
        if(this.mouseClicked.get(0)){
            const currentX=this.MouseTrack.get("current").get("x");
            //console.log(this.currentvMin,currentX,this.currentvMax);
            if(this.currentvMin<currentX&&currentX<this.currentvMax){
                this.CenterFlag=true;
            }
        }else{
            this.CenterFlag=false;
        }
    }


    setObserverEvents(){
        /*イベント関連のフラグ*/
        //マウスホイール、キーダウンを監視
        this.mouseenter=false;
        this.pressedkey=new Map();//押されたキーにTrueを入れる、押されなくなったらdelateする
        this.mouseClicked=new Map();
        this.MouseTrack=new Map([
            ["previous",new Map()],
            ["current",new Map()]
        ]);

        /*イベントマネージャーユーザーの監視*/
        /*Canvasとラップdivの大きさは常に同じにする。そして、画像のズームパン、ローカルスライスやアラインはdivに紐づける*/
        //マウスの位置はcanvas内=CanvasBlockに入っているかで考える
        this.EventSetHelper(this.HistgramSVG,"mouseenter",(e)=>{
            this.mouseenter=true;
            //CanvasBlockにフォーカスさせる
            e.target.focus();
            //console.log("mouseenter",this.mouseenter);
            this.FlagManager();
        });

        this.EventSetHelper(this.HistgramSVG,"mouseleave",(e)=>{
            //CanvasBlockからフォーカスを外す
            this.mouseenter=false;
            //その他の監視変数も初期状態に戻す
            this.pressedkey.clear();
            this.mouseClicked.clear();
            this.MouseTrack.get("previous").clear();
            this.MouseTrack.get("current").clear();
            //フォーカスを外す
            e.target.blur();
            this.FlagManager();
        });
        //キーボードが押されているかを監視
        //キーボードが押されっぱなしのときは一定間隔で連続発火する。
        /*
        this.EventSetHelper(this.CanvasContainer,"keydown",(e)=>{
            this.pressedkey.set(e.code,true);
            //console.log(this.pressedkey);
            this.FlagManager();
        });
        this.EventSetHelper(this.CanvasContainer,"keyup",(e)=>{
            this.pressedkey.delete(e.code);
            //console.log(this.pressedkey);
            this.FlagManager();
        });
        */
        //マウスの動き監視
        //マウスが押されたときにFlagManegerを読んでCenterイベントが動けるか確かめる。
        this.EventSetHelper(this.HistgramSVG,"mousedown",(e)=>{
            this.mouseClicked.set(e.button,true);
            //console.log(this.mouseClicked);
            this.FlagManager();
        });
        this.EventSetHelper(this.HistgramSVG,"mouseup",(e)=>{
            this.mouseClicked.delete(e.button);
            //console.log(this.mouseClicked);
            this.FlagManager();
        });

        this.EventSetHelper(this.HistgramSVG,"mousemove",(e)=>{
            //座標を更新
            //console.log(e.target);
            const oldpoints=this.MouseTrack.get("previous");
            const newpoints=this.MouseTrack.get("current");
            oldpoints.set("x",newpoints.get("x"));
            oldpoints.set("y",newpoints.get("y"));
            const pt=this.HistgramSVG.createSVGPoint();
            pt.x=e.clientX;
            pt.y=e.clientY;
            //console.log(e.clientX,e.clientY);
            //console.log(e.offsetX,e.offsetY);
            const NewPoint=pt.matrixTransform(this.HistgramSVG.getScreenCTM().inverse());
            //console.log(NewPoint);
            newpoints.set("x",NewPoint.x);
            newpoints.set("y",NewPoint.y);
            //console.log(newpoints.get("x"));
        })
    }
    setUserEvents(){
        //値の更新時に整数に丸め込むと全く更新されなくなる気がする。
        //Radiusイベント
        this.RadiusFlag=false;
        this.EventSetHelper(this.HistgramSVG,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            if(this.RadiusFlag){
                const changevalue=-Math.sign(e.deltaY)*10;//下に回すと正、下に回すと半径を絞りたいので逆転
                const newrange=Math.max(this.currentradius+changevalue,0);
                //新しい半径で計算する
                const newvmin=this.currentcenter-newrange;
                const newvmax=this.currentcenter+newrange;
                this.CheckAndSetValues(newvmin,newvmax);
                //this.Redraw();
            }
        });
        //Centerイベント
        this.CenterFlag=false;
        this.EventSetHelper(this.HistgramSVG,"mousemove",(e)=>{
            if(this.CenterFlag){
                //console.log(CanvasRect.width);
                const movement=this.MouseTrack.get("current").get("x")-this.MouseTrack.get("previous").get("x");
                //const newcenter=this.currentcenter+movement;
                const newvmin=this.currentvMin+movement;
                const newvmax=this.currentvMax+movement;
                this.CheckAndSetValues(newvmin,newvmax);
                //this.Redraw();
            }
        });
        //Inputにイベント設定
        //入力による値は、Enterが押された後に確定するものとする。
        //フォーカスが外れても反映されるようにする
        //スピンボタンは無効化されているのでよし
        const minmaxinputevent=()=>{
            const newvMin=parseFloat(this.MinValueInput.value);
            const currentvMin=this.currentvMin;
            const newvMax=parseFloat(this.MaxValueInput.value);
            const currentvMax=this.currentvMax;
            const ValidvMinFlag=Number.isFinite(newvMin);
            const ValidvMaxFlag=Number.isFinite(newvMax);
            if((ValidvMinFlag&&newvMin!==currentvMin)||(ValidvMaxFlag&&newvMax!==currentvMax)){
                this.CheckAndSetValues(newvMin,newvMax);
            }else{
                this.MinValueInput.value=currentvMin;
                this.MaxValueInput.value=currentvMax;
            }
            //this.Redraw();
        };
        this.EventSetHelper(this.MinValueInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                minmaxinputevent();
            }
        });
        this.EventSetHelper(this.MinValueInput,"blur",()=>{
            minmaxinputevent();
        });
        this.EventSetHelper(this.MinValueInput,"focus",()=>{
            this.MinValueInput.select();
        });

        this.EventSetHelper(this.MaxValueInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                minmaxinputevent();
            }
        });
        this.EventSetHelper(this.MaxValueInput,"blur",()=>{
            minmaxinputevent();
        });
        this.EventSetHelper(this.MaxValueInput,"focus",()=>{
            this.MaxValueInput.select();
        });

        const centerradiusevent=()=>{
            const NewCenter=parseFloat(this.CenterValueInput.value);
            const CurrentCenter=this.currentcenter;
            const NewRadius=parseFloat(this.RadiusValueInput.value);
            const CurrentRadius=this.currentradius;
            const ValidCenterFlag=Number.isFinite(NewCenter);
            const ValidRadiusFlag=Number.isFinite(NewRadius);
            if((ValidCenterFlag&&NewCenter!==CurrentCenter)||(ValidRadiusFlag&&NewRadius!==CurrentRadius)){
                const newvMin=NewCenter-NewRadius;
                const newvMax=NewCenter+NewRadius;
                this.CheckAndSetValues(newvMin,newvMax);
            }else{
                this.CenterValueInput.value=CurrentCenter;
                this.RadiusValueInput.value=CurrentRadius;
            }
            //this.Redraw();
        };
        this.EventSetHelper(this.CenterValueInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                centerradiusevent();
            }
        });
        this.EventSetHelper(this.CenterValueInput,"blur",()=>{
            centerradiusevent();
        });
        this.EventSetHelper(this.CenterValueInput,"focus",()=>{
            this.CenterValueInput.select();
        });
        this.EventSetHelper(this.RadiusValueInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                centerradiusevent();
            }
        });
        this.EventSetHelper(this.RadiusValueInput,"blur",()=>{
            centerradiusevent();
        });
        this.EventSetHelper(this.RadiusValueInput,"focus",()=>{
            this.RadiusValueInput.select();
        });
    }
    CheckAndSetValues(protvmin,protvmax){
        /*
        const vMin=Math.trunc(this.currentvMin*10)/10;
        const vMax=Math.trunc(this.currentvMax*10)/10;
        const center=Math.trunc(this.currentcenter*10)/10;
        const radius=Math.trunc(this.currentradius*10)/10;
        //this.textContainer.textContent=`${vMin} ~ ${vMax}`;
        this.MinValueInput.value=vMin;
        this.MaxValueInput.value=vMax;
        this.CenterValueInput.value=center;
        this.RadiusValueInput.value=radius;
        */
        //新しい値を計算して境界チェック
        const NewMin=Math.max(this.xmin,Math.min(protvmin,this.xmax));
        const NewMax=Math.max(this.xmin,Math.min(protvmax,this.xmax));
        const NewCenter=(NewMax+NewMin)/2;
        const NewRadius=(NewMax-NewMin)/2;
        //console.log(NewMin,NewMax,NewCenter,NewRadius);
        //境界値を考慮した新しい値に更新
        this.currentvMin=NewMin;
        this.currentvMax=NewMax;
        this.currentcenter=NewCenter;
        this.currentradius=NewRadius;
        //入力欄には小数点１位まで表示する
        this.MinValueInput.value=Math.trunc(NewMin*10)/10;
        this.MaxValueInput.value=Math.trunc(NewMax*10)/10;
        this.CenterValueInput.value=Math.trunc(NewCenter*10)/10;
        this.RadiusValueInput.value=Math.trunc(NewRadius*10)/10;
        //各線の更新
        this.MinValueLine.setAttribute("x1",this.currentvMin);
        this.MinValueLine.setAttribute("x2",this.currentvMin);
        //this.MinValueLine.setAttribute("y1",this.ymin);
        //this.MinValueLine.setAttribute("y2",this.ymax);

        this.MaxValueLine.setAttribute("x1",this.currentvMax);
        this.MaxValueLine.setAttribute("x2",this.currentvMax);
        //this.MaxValueLine.setAttribute("y1",this.ymin);
        //this.MaxValueLine.setAttribute("y2",this.ymax);

        this.CenterValueLine.setAttribute("x1",this.currentcenter);
        this.CenterValueLine.setAttribute("x2",this.currentcenter);
        //this.CenterValueLine.setAttribute("y1",this.ymin);
        //this.CenterValueLine.setAttribute("y2",this.ymax);

        this.RadiusValueLine.setAttribute("x1",this.currentvMin);
        this.RadiusValueLine.setAttribute("x2",this.currentvMax);
        //this.RadiusValueLine.setAttribute("y1",this.ymin/2);
        //this.RadiusValueLine.setAttribute("y2",this.ymin/2);
        const FromSubToMainProcessData=new Map([
            ["action","ChangeCTWindowing"],
            ["data",new Map([
                ["vMin",this.currentvMin],
                ["vMax",this.currentvMax],
                /*送信先*/
                ["CanvasID",this.TargetCanvasID],
                ["Layer",this.TargetLayer]
            ])]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    PassChangesToMainWindow(data){
        window.SubWindowMainProcessAPI.FromSubToMainProcess(data);
    }
    setSubWindowCloseEvents(){
        //メインプロセスからサブウィンドウの終了連絡がきたときの処理
        window.SubWindowMainProcessAPI.CloseSubWindowFromMainProcessToSub((event,ReceiveData)=>{
            //このサブウィンドウでは一つのキャンバスしか参照しないのでそれに対して一応OPモードの終了を要望する
            const ClosingDataList=[];
            //特にMultiUseLayerを使っていないので空リストを返す
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
    const CTWindowingobj=new CTWindowingClass(SendingData);
});