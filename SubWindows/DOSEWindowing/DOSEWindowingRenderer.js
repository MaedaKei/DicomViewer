//CTWindowingRenderer.js
//CTWindowingのサブウィンドウのレンダラー
//ヒストグラムとCTWindowingの操作を行う
//rangeは半径とする
console.log("DOSEWindowingRenderer.js loaded");
class DOSEWindowingClass{
    constructor(SendingData){
        this.HistgramSVG=document.getElementById("HistgramSVG");//これにマウスイベントを設置する
        const HistgramPath=document.getElementById("HistgramPath");
        this.LowerLimitDoseLine=document.getElementById("LowerLimitDoseLine");
        this.TargetDoseLine=document.getElementById("TargetDoseLine");

        this.TargetDoseGyInput=document.getElementById("TargetDoseGyInput");
        this.LowerLimitDoseGyInput=document.getElementById("LowerLimitDoseGyInput");
        this.LowerLimitDoseParcentageInput=document.getElementById("LowerLimitDoseParcentageInput");
        const ReceivedDataBody=SendingData.get("data");
        this.TargetCanvasID=ReceivedDataBody.get("CanvasID");
        this.TargetLayer=ReceivedDataBody.get("Layer");
        const TargetDose=ReceivedDataBody.get("TargetDose");
        const LowerLimitDose=ReceivedDataBody.get("LowerLimitDose");
        console.log(TargetDose,LowerLimitDose);
        //マウスホイールやパンではあくまでパーセンテージを維持したまま移動することにする
        this.CurrentTargetDoseGy=TargetDose;
        this.CurrentLowerLimitDoseGy=LowerLimitDose;//元の数値
        const LowerLimitDoseParcentage=LowerLimitDose/TargetDose
        this.CurrentLowerLimitDoseParcentage=LowerLimitDoseParcentage;//比率
        console.log("Initalize",this.CurrentLowerLimitDoseParcentage);

        const TargetDoseGyforText=Math.trunc(TargetDose*100)/100;
        const LowerLimitDoseGyforText=Math.trunc(LowerLimitDose*100)/100;
        const LowerLimitDoseParcentageforText=Math.trunc(LowerLimitDoseParcentage*10000)/100
        
        this.TargetDoseGyInput.value=TargetDoseGyforText;
        this.TargetDoseGyInput.setAttribute("data-PreviousValue",TargetDoseGyforText);
        this.LowerLimitDoseGyInput.value=LowerLimitDoseGyforText;
        this.LowerLimitDoseGyInput.setAttribute("data-PreviousValue",LowerLimitDoseGyforText);
        this.LowerLimitDoseParcentageInput.value=LowerLimitDoseParcentageforText;
        this.LowerLimitDoseParcentageInput.setAttribute("data-PreviousValue",LowerLimitDoseParcentageforText);

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
        this.TargetDoseLine.setAttribute("x1",this.CurrentTargetDoseGy);
        this.TargetDoseLine.setAttribute("x2",this.CurrentTargetDoseGy);
        this.TargetDoseLine.setAttribute("y1",this.ymin);
        this.TargetDoseLine.setAttribute("y2",this.ymax);

        this.LowerLimitDoseLine.setAttribute("x1",this.CurrentLowerLimitDoseGy);
        this.LowerLimitDoseLine.setAttribute("x2",this.CurrentLowerLimitDoseGy);
        this.LowerLimitDoseLine.setAttribute("y1",this.ymin);
        this.LowerLimitDoseLine.setAttribute("y2",this.ymax);

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
        /*カラーマップの色を作成*/
        const LinearGradient=document.getElementById("JetColorMap");
        const LinearGradientFragment=document.createDocumentFragment();
        const SVGNameSpace="http://www.w3.org/2000/svg";
        const ColorMapArray=ReceivedDataBody.get("ColorMapArray");//N分割した連続的カラーマップのrgb(r,g,b)テキストが入っている
        const Step=ColorMapArray.length;
        //設定するときは0％～100％に向かって設定しないといけない。つまり、赤から青に向かうのでColorMapArrayには末尾からアクセスする
        //カラーマップは下から上に大きい線量となる。ColorMapArrayも小さいほうから入っている
        for(let i=0;i<Step;i++){
            const t=i/(Step-1);
            const Stop=document.createElementNS(SVGNameSpace,"stop");
            const ColorText=ColorMapArray[(Step-1)-i];
            Stop.setAttribute("offset",`${t*100}%`);
            Stop.setAttribute("stop-color",ColorText);
            LinearGradientFragment.appendChild(Stop);
        }
        LinearGradient.appendChild(LinearGradientFragment);
        //SVGに座標系を設定
        const ViewBoxWidth=100;
        const ColorMapWidth=100;
        const ColorMapSVG=document.getElementById("ColorMapSVG");
        ColorMapSVG.setAttribute("viewBox",`0 0 ${ViewBoxWidth} ${Step}`);//Stepと同じだけの座標系を持たせる
        const ColorMapRect=document.getElementById("ColorMapRect");
        ColorMapRect.setAttribute("x",0);
        ColorMapRect.setAttribute("y",0);
        ColorMapRect.setAttribute("width",ColorMapWidth);
        ColorMapRect.setAttribute("height",Step);
        //TargetDoseとLowerLimitDoseの線量のテキストを配置
        /*
        const TextHeight=10;//座標系上の高さ
        const TargetDoseGyText=document.getElementById("TargetDoseGyText");
        TargetDoseGyText.setAttribute("x",ColorMapWidth);//左上
        TargetDoseGyText.setAttribute("y",0);//左上
        TargetDoseGyText.setAttribute("width",ViewBoxWidth-ColorMapWidth);
        TargetDoseGyText.setAttribute("height",TextHeight);
        this.TargetDoseGyText=TargetDoseGyText
        this.TargetDoseGyText.textContent=`${this.TargetDoseGyInput.value}`
        const LowerLimitDoseGyText=document.getElementById("LowerLimitDoseGyText");
        LowerLimitDoseGyText.setAttribute("x",ColorMapWidth);//左上
        LowerLimitDoseGyText.setAttribute("y",Step-TextHeight);//左上
        LowerLimitDoseGyText.setAttribute("width",ViewBoxWidth-ColorMapWidth);
        LowerLimitDoseGyText.setAttribute("height",TextHeight);
        */
        /*
        const Rect=document.createElementNS("http://www.w3.org/2000/svg","rect");
        Rect.setAttribute("x",60);//左上
        Rect.setAttribute("y",Step-TextHeight);//左上
        Rect.setAttribute("width",40);
        Rect.setAttribute("height",TextHeight);
        Rect.setAttribute("fill","red");
        ColorMapSVG.appendChild(Rect);
        this.LowerLimitDoseGyText=LowerLimitDoseGyText;
        this.LowerLimitDoseGyText.textContent=`${this.LowerLimitDoseGyInput.value}`
        */
        this.TargetDoseGyLabel=document.getElementById("TargetDoseGyLabel");
        this.TargetDoseGyLabel.textContent=`${this.TargetDoseGyInput.value}`;
        this.LowerLimitDoseGyLabel=document.getElementById("LowerLimitDoseGyLabel");
        this.LowerLimitDoseGyLabel.textContent=`${this.LowerLimitDoseGyInput.value}`;
    }

    FlagManager(){
        //マウスホイールによるRadiusの操作
        //Canvas内にマウスがあればよい
        if(this.mouseenter){
            this.LowerLimitDoseGyChangeFlag=true;
        }else{
            this.LowerLimitDoseGyChangeFlag=false;
        }
        //ドラッグ＆ドロップによるCenterの操作
        //curretnvminとcurrentvmaxの間にマウスがあればよい
        //マウスが右クリックされている間
        //押された瞬間に条件を満たしていれば離すまでは動作するものとする
        const CtrlPressedFlag=this.pressedkey.has("ControlLeft")||this.pressedkey.has("ControlRight");
        if(this.mouseenter&&this.mouseClicked.has(0)&&CtrlPressedFlag){
            this.TargetDoseGyChangeGyModeFlag=true;
        }else{
            this.TargetDoseGyChangeGyModeFlag=false;
        }
        if(this.mouseenter&&this.mouseClicked.has(0)&&!CtrlPressedFlag){
            this.TargetDoseGyChangeParcentageModeFlag=true;
        }else{
            this.TargetDoseGyChangeParcentageModeFlag=false;
        }
    }

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
        this.EventSetHelper(this.HistgramSVG,"keydown",(e)=>{
            this.pressedkey.add(e.code);
            //console.log(this.pressedkey);
            this.FlagManager();
        });
        this.EventSetHelper(this.HistgramSVG,"keyup",(e)=>{
            this.pressedkey.delete(e.code);
            //console.log(this.pressedkey);
            this.FlagManager();
        });
        //マウスの動き監視
        //マウスが押されたときにFlagManegerを読んでCenterイベントが動けるか確かめる。
        this.EventSetHelper(this.HistgramSVG,"mousedown",(e)=>{
            this.mouseClicked.add(e.button);
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
        });
    }
    setUserEvents(){
        //値の更新時に整数に丸め込むと全く更新されなくなる気がする。
        //Radiusイベント
        this.LowerLimitDoseGyChangeFlag=false;
        this.EventSetHelper(this.HistgramSVG,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            if(this.LowerLimitDoseGyChangeFlag){
                //LowerLimitの変更
                const changevalue=Math.sign(e.deltaY)*1;//下に回すと正、下に回すと半径を絞りたいので逆転
                const NewLowerLimitDoseGy=Math.max(this.xmin,Math.min(this.CurrentLowerLimitDoseGy+changevalue,this.CurrentTargetDoseGy));//0~100%の間で変動
                //新しい半径で計算する
                //const newvmin=this.currentcenter-newrange;
                //const newvmax=this.currentcenter+newrange;
                const NewTargetDoseGy=this.CurrentTargetDoseGy;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
                //this.Redraw();
            }
        });
        //TargetとLowerLimitの幅を保ったままの移動
        this.TargetDoseGyChangeGyModeFlag=false;
        this.EventSetHelper(this.HistgramSVG,"mousemove",(e)=>{
            if(this.TargetDoseGyChangeGyModeFlag){
                //console.log(CanvasRect.width);
                const movement=this.MouseTrack.get("current").get("x")-this.MouseTrack.get("previous").get("x");
                //const newcenter=this.currentcenter+movement;
                const NewTargetDoseGy=this.CurrentTargetDoseGy+movement;
                const NewLowerLimitDoseGy=this.CurrentLowerLimitDoseGy+movement;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
                //this.Redraw();
            }
        });
        //Targetとパーセンテージを保ったままの移動
        this.TargetDoseGyChangeParcentageModeFlag=false;
        this.EventSetHelper(this.HistgramSVG,"mousemove",(e)=>{
            if(this.TargetDoseGyChangeParcentageModeFlag){
                //console.log(CanvasRect.width);
                const movement=this.MouseTrack.get("current").get("x")-this.MouseTrack.get("previous").get("x");
                //const newcenter=this.currentcenter+movement;
                const NewTargetDoseGy=this.CurrentTargetDoseGy+movement;
                const NewLowerLimitDoseGy=NewTargetDoseGy*this.CurrentLowerLimitDoseParcentage;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
                //this.Redraw();
            }
        });
        //Inputにイベント設定
        //入力による値は、Enterが押された後に確定するものとする。
        //フォーカスが外れても反映されるようにする
        //スピンボタンは無効化されているのでよし
        /*TargetDoseGyInput*/
        const TargetDoseGyInputFunction=()=>{
            //const newvmin=parseInt(this.MinValueInput.value);
            //const newvmax=parseInt(this.MaxValueInput.value);
            const CurrentInputValue=parseFloat(this.TargetDoseGyInput.value);
            const PreviousInputValue=parseFloat(this.TargetDoseGyInput.getAttribute("data-PreviousValue"));
            if(CurrentInputValue!==PreviousInputValue){
                const NewTargetDoseGy=CurrentInputValue;
                const NewLowerLimitDoseGy=this.CurrentLowerLimitDoseGy;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
            }
            //this.Redraw();
        };
        this.EventSetHelper(this.TargetDoseGyInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                TargetDoseGyInputFunction();
            }
        });
        this.EventSetHelper(this.TargetDoseGyInput,"blur",()=>{
            TargetDoseGyInputFunction();
        });
        this.EventSetHelper(this.TargetDoseGyInput,"focus",()=>{
            this.TargetDoseGyInput.select();
        });
        /*LowerLimitDoseGyInput*/
        const LowerLimitDoseGyInputFunction=()=>{
            const CurrentInputValue=parseFloat(this.LowerLimitDoseGyInput.value);
            const PreviousInputValue=parseFloat(this.LowerLimitDoseGyInput.getAttribute("data-PreviousValue"));
            if(CurrentInputValue!==PreviousInputValue){
                const NewTargetDoseGy=this.CurrentTargetDoseGy;
                const NewLowerLimitDoseGy=CurrentInputValue;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
            }
        }
        this.EventSetHelper(this.LowerLimitDoseGyInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                LowerLimitDoseGyInputFunction();
            }
        });
        this.EventSetHelper(this.LowerLimitDoseGyInput,"blur",()=>{
            LowerLimitDoseGyInputFunction();
        });
        this.EventSetHelper(this.LowerLimitDoseGyInput,"focus",()=>{
            this.LowerLimitDoseGyInput.select();
        });
        /*LowerLimitDoseParcentageInput*/
        const LowerLimitDoseGyParcentageFunction=()=>{
            const CurrentInputValue=parseFloat(this.LowerLimitDoseParcentageInput.value);
            const PreviousInputValue=parseFloat(this.LowerLimitDoseParcentageInput.getAttribute("data-PreviousValue"));
            if(CurrentInputValue!==PreviousInputValue){//入力欄の値が変わっていれば処理を走らせる
                const NewTargetDoseGy=this.CurrentTargetDoseGy;
                const NewLowerLimitDoseParcentage=CurrentInputValue/100;//%⇒小数
                const NewLowerLimitDoseGy=NewTargetDoseGy*NewLowerLimitDoseParcentage;
                this.CheckAndSetValues(NewTargetDoseGy,NewLowerLimitDoseGy);
            }
        };
        this.EventSetHelper(this.LowerLimitDoseParcentageInput,"keydown",(e)=>{
            if(e.code==="Enter"){
                LowerLimitDoseGyParcentageFunction();
            }
        });
        this.EventSetHelper(this.LowerLimitDoseParcentageInput,"blur",()=>{
            LowerLimitDoseGyParcentageFunction();
        });
        this.EventSetHelper(this.LowerLimitDoseParcentageInput,"focus",()=>{
            this.LowerLimitDoseParcentageInput.select();
        });
    }
    CheckAndSetValues(NewTargeDoseGy,NewLowerLimitDoseGy){
        //TargetDoseGyのチェック
        let TargetDoseGy;
        if(Number.isFinite(NewTargeDoseGy)){
            TargetDoseGy=Math.max(this.xmin,Math.min(NewTargeDoseGy,this.xmax));//最大値を超えていないか
        }else{
            TargetDoseGy=this.CurrentTargetDoseGy;
        }
        let LowerLimitDoseGy;
        if(Number.isFinite(NewLowerLimitDoseGy)){
            //xmin~TargetDoseGyにおさまっているか
            LowerLimitDoseGy=Math.max(this.xmin,Math.min(NewLowerLimitDoseGy,TargetDoseGy));
        }else{
            //不正な値の場合、元の数値を使って新しい値を算出する
            LowerLimitDoseGy=Math.max(this.xmin,Math.min(this.CurrentLowerLimitDoseGy,TargetDoseGy));
        }
        //%の算出について、TargetDoseGy＝0のときは、無条件で0％とする。
        let LowerLimitDoseParcentage;//0~1
        if(TargetDoseGy===0){
            LowerLimitDoseParcentage=0;
        }else{
            LowerLimitDoseParcentage=LowerLimitDoseGy/TargetDoseGy;
        }
        //console.log(NewMin,NewMax,NewCenter,NewRadius);
        //境界値を考慮した新しい値に更新
        this.CurrentTargetDoseGy=TargetDoseGy;
        this.CurrentLowerLimitDoseGy=LowerLimitDoseGy;
        this.CurrentLowerLimitDoseParcentage=LowerLimitDoseParcentage;//0~1
        //入力欄には小数点2位まで表示する
        const TargetDoseGyforText=Math.trunc(TargetDoseGy*100)/100;
        const LowerLimitDoseGyforText=Math.trunc(LowerLimitDoseGy*100)/100;
        this.TargetDoseGyInput.value=TargetDoseGyforText;
        this.TargetDoseGyInput.setAttribute("data-PreviousValue",TargetDoseGyforText);
        this.LowerLimitDoseGyInput.value=LowerLimitDoseGyforText;
        this.LowerLimitDoseGyInput.setAttribute("data-PreviousValue",LowerLimitDoseGyforText);
        const LowerLimitDoseParcentageforText=Math.trunc(LowerLimitDoseParcentage*100*100)/100
        this.LowerLimitDoseParcentageInput.value=LowerLimitDoseParcentageforText;
        this.LowerLimitDoseParcentageInput.setAttribute("data-PreviousValue",LowerLimitDoseParcentageforText);
        this.TargetDoseGyLabel.textContent=TargetDoseGyforText;
        this.LowerLimitDoseGyLabel.textContent=LowerLimitDoseGyforText;
        //各線の更新
        this.TargetDoseLine.setAttribute("x1",TargetDoseGy);
        this.TargetDoseLine.setAttribute("x2",TargetDoseGy);
        this.LowerLimitDoseLine.setAttribute("x1",LowerLimitDoseGy);
        this.LowerLimitDoseLine.setAttribute("x2",LowerLimitDoseGy);
        //this.RadiusValueLine.setAttribute("y1",this.ymin/2);
        //this.RadiusValueLine.setAttribute("y2",this.ymin/2);
        const FromSubToMainProcessData=new Map([
            ["action","ChangeDOSEWindowing"],
            ["data",new Map([
                ["TargetDose",TargetDoseGy],
                ["LowerLimitDose",LowerLimitDoseGy],
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
            console.log(`EventSettingError\n${element}\n${callback}\n${error}`);
        }
    }

}
window.SubWindowMainProcessAPI.initializeSubWindow((event,SendingData)=>{
    const DOSEWindowingobj=new DOSEWindowingClass(SendingData);
});