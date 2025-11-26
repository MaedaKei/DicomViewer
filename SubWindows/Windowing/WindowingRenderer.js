//WindowingRenderer.js
//Windowingのサブウィンドウのレンダラー
//ヒストグラムとWindowingの操作を行う
//rangeは半径とする
console.log("WindowingRenderer.js loaded");
class WindowingClass{
    constructor(SendingData){
        this.CanvasContainer=document.getElementById("CanvasContainer");//ここにイベントを紐づける
        this.histgramCanvas=document.getElementById("histgramCanvas");
        this.lineCanvas=document.getElementById("lineCanvas");

        this.MinColor="#0000FF";
        this.MinValueInput=document.getElementById("MinValueInput");
        document.getElementById("MinValueLabel").style.color=this.MinColor;

        this.MaxColor="#FF0000";
        this.MaxValueInput=document.getElementById("MaxValueInput");
        document.getElementById("MaxValueLabel").style.color=this.MaxColor;

        this.CenterColor="#00FF00";
        this.CenterValueInput=document.getElementById("CenterValueInput");
        document.getElementById("CenterValueLabel").style.color=this.CenterColor;

        this.RadiusColor="#FFFF00";
        this.RadiusValueInput=document.getElementById("RadiusValueInput");
        document.getElementById("RadiusValueLabel").style.color=this.RadiusColor;
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
        /*それぞれのキャンバスに描画*/
        /*ヒストグラム描画開始*/
        const histgramctx=this.histgramCanvas.getContext("2d");
        const histgramArray=[];
        let ymin=Infinity,ymax=-Infinity;
        for(const [key,value] of ReceivedDataBody.get("histgram")){
            const newvalue=Math.pow(value,0.3);
            if(newvalue<ymin){
                ymin=newvalue;
            }
            else if(newvalue>ymax){
                ymax=newvalue;
            }
            histgramArray.push([key,newvalue]);
        }
        this.xmin=histgramArray[0][0];
        this.xmax=histgramArray[histgramArray.length-1][0];
        this.ymin=ymin;
        this.ymax=ymax;
        //内部座標大きすぎると見にくくなるのである程度圧縮する
        this.CanvasWidth=500;//(px)
        this.CanvasHeight=500;//
        //Canvasの座標系は上の4つにする
        this.histgramCanvas.width=this.CanvasWidth;
        this.histgramCanvas.height=this.CanvasHeight;
        this.lineCanvas.width=this.CanvasWidth;
        this.lineCanvas.height=this.CanvasHeight;
        histgramctx.clearRect(0,0,this.histgramCanvas.width,this.histgramCanvas.height);
        histgramctx.beginPath();
        histgramctx.strokeStyle="#FFFFFF";
        histgramctx.lineWidth=2;
        const canvaswidth=this.histgramCanvas.width;
        const canvasheight=this.histgramCanvas.height;
        this.xscale=canvaswidth/(this.xmax-this.xmin);
        this.yscale=canvasheight/(this.ymax-this.ymin);
        histgramctx.moveTo(
            (histgramArray[0][0]-this.xmin)*this.xscale,
            canvasheight-(histgramArray[0][1]-this.ymin)*this.yscale
        );
        for(let i=1;i<histgramArray.length;i++){
            histgramctx.lineTo(
                (histgramArray[i][0]-this.xmin)*this.xscale,
                canvasheight-(histgramArray[i][1]-this.ymin)*this.yscale
            );
        }
        histgramctx.stroke();
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
        this.FromSubToMainProcessData=new Map([
            ["action","ChangeWindowing"],
            ["data",new Map([
                ["vMin",this.currentvMin],
                ["vMax",this.currentvMax],
                /*送信先*/
                ["CanvasID",this.TargetCanvasID],
                ["Layer",this.TargetLayer]
            ])]
        ]);
        //描画処理は一番最後
        this.Redraw();
    }
    Redraw(){
        //現在の状態になるようにlineCanvasを書き換える
        //上限値下限値の垂線を描画
        const lineWidth=2;
        //上限、下限、中央の描画用座標
        const maxX=(this.currentvMax-this.xmin)*this.xscale;
        const minX=(this.currentvMin-this.xmin)*this.xscale;
        const centerX=(this.currentcenter-this.xmin)*this.xscale;
        const linectx=this.lineCanvas.getContext("2d");
        linectx.clearRect(0,0,this.lineCanvas.width,this.lineCanvas.height);
        //上限の垂線
        linectx.beginPath();
        linectx.strokeStyle=this.MaxColor;
        linectx.lineWidth=lineWidth;
        linectx.moveTo(maxX,0);
        linectx.lineTo(maxX,this.lineCanvas.height);
        linectx.stroke();
        //下限の垂線
        linectx.beginPath();
        linectx.strokeStyle=this.MinColor;
        linectx.lineWidth=lineWidth;
        linectx.moveTo(minX,0);
        linectx.lineTo(minX,this.lineCanvas.height);
        linectx.stroke();
        //半径線の表示
        const radiusY1=this.lineCanvas.height*0.6;
        const radiusY2=this.lineCanvas.height*0.4;
        linectx.beginPath();
        linectx.strokeStyle=this.RadiusColor;
        linectx.lineWidth=lineWidth;
        linectx.moveTo(minX,radiusY1);
        linectx.lineTo(centerX,radiusY1);
        linectx.lineTo(centerX,radiusY2);
        linectx.lineTo(maxX,radiusY2);
        linectx.stroke();
        //中央線
        linectx.beginPath();
        linectx.strokeStyle=this.CenterColor;
        linectx.moveTo(centerX,0);
        linectx.lineTo(centerX,this.lineCanvas.height);
        linectx.stroke();

        const vMin=Math.trunc(this.currentvMin*10)/10;
        const vMax=Math.trunc(this.currentvMax*10)/10;
        const center=Math.trunc(this.currentcenter*10)/10;
        const radius=Math.trunc(this.currentradius*10)/10;
        //this.textContainer.textContent=`${vMin} ~ ${vMax}`;
        this.MinValueInput.value=vMin;
        this.MaxValueInput.value=vMax;
        this.CenterValueInput.value=center;
        this.RadiusValueInput.value=radius;
        //MainWindowにデータを送信する
        
        const data=this.FromSubToMainProcessData.get("data");
        data.set("vMin",vMin);
        data.set("vMax",vMax);
        window.SubWindowMainProcessAPI.FromSubToMainProcess(this.FromSubToMainProcessData);
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
        if(this.MouseDowning.get(0)){
            const currentMouseX=this.MouseTrack.get("current").get("x");
            const rect=this.CanvasContainer.getBoundingClientRect();//0~N
            const currentX=this.xmin+((this.xmax-this.xmin)*currentMouseX/rect.width);//xmin~
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
        this.MouseDowning=new Map();
        this.MouseTrack=new Map([
            ["previous",new Map()],
            ["current",new Map()]
        ]);

        /*イベントマネージャーユーザーの監視*/
        /*Canvasとラップdivの大きさは常に同じにする。そして、画像のズームパン、ローカルスライスやアラインはdivに紐づける*/
        //マウスの位置はcanvas内=CanvasBlockに入っているかで考える
        this.EventSetHelper(this.CanvasContainer,"mouseenter",(e)=>{
            this.mouseenter=true;
            //CanvasBlockにフォーカスさせる
            e.target.focus();
            //console.log("mouseenter",this.mouseenter);
            this.FlagManager();
        });

        this.EventSetHelper(this.CanvasContainer,"mouseleave",(e)=>{
            //CanvasBlockからフォーカスを外す
            this.mouseenter=false;
            //その他の監視変数も初期状態に戻す
            this.pressedkey.clear();
            this.MouseDowning.clear();
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
        this.EventSetHelper(this.CanvasContainer,"mousedown",(e)=>{
            this.MouseDowning.set(e.button,true);
            //console.log(this.MouseDowning);
            this.FlagManager();
        });
        this.EventSetHelper(this.CanvasContainer,"mouseup",(e)=>{
            this.MouseDowning.delete(e.button);
            //console.log(this.MouseDowning);
            this.FlagManager();
        });

        this.EventSetHelper(this.CanvasContainer,"mousemove",(e)=>{
            //座標を更新
            const oldpoints=this.MouseTrack.get("previous");
            const newpoints=this.MouseTrack.get("current");
            oldpoints.set("x",newpoints.get("x"));
            oldpoints.set("y",newpoints.get("y"));
            newpoints.set("x",e.offsetX);
            newpoints.set("y",e.offsetY);
            //console.log(newpoints.get("x"));
        })
    }
    setUserEvents(){
        //値の更新時に整数に丸め込むと全く更新されなくなる気がする。
        //Radiusイベント
        this.RadiusFlag=false;
        this.EventSetHelper(this.CanvasContainer,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            if(this.RadiusFlag){
                const changevalue=-Math.sign(e.deltaY)*10;//下に回すと正、下に回すと半径を絞りたいので逆転
                const newrange=Math.max(this.currentradius+changevalue,0);
                //新しい半径で計算する
                const newvmin=this.currentcenter-newrange;
                const newvmax=this.currentcenter+newrange;
                this.CheckAndSetValues(newvmin,newvmax);
                this.Redraw();
            }
        });
        //Centerイベント
        this.CenterFlag=false;
        this.EventSetHelper(this.CanvasContainer,"mousemove",(e)=>{
            if(this.CenterFlag){
                //CanvasContainerの実際の大きさを取得
                const CanvasRect=this.CanvasContainer.getBoundingClientRect();
                //console.log(CanvasRect.width);
                const movement=(this.xmax-this.xmin)*(this.MouseTrack.get("current").get("x")-this.MouseTrack.get("previous").get("x"))/CanvasRect.width;
                //const newcenter=this.currentcenter+movement;
                const newvmin=this.currentvMin+movement;
                const newvmax=this.currentvMax+movement;
                this.CheckAndSetValues(newvmin,newvmax);
                this.Redraw();
            }
        });
        //Inputにイベント設定
        //入力による値は、Enterが押された後に確定するものとする。
        //フォーカスが外れても反映されるようにする
        //スピンボタンは無効化されているのでよし
        const minmaxinputevent=()=>{
            const newvmin=parseInt(this.MinValueInput.value);
            const newvmax=parseInt(this.MaxValueInput.value);
            this.CheckAndSetValues(newvmin,newvmax);
            this.Redraw();
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
            const center=parseInt(this.CenterValueInput.value);
            const radius=parseInt(this.RadiusValueInput.value);
            const newvmin=center-radius;
            const newvmax=center+radius;
            this.CheckAndSetValues(newvmin,newvmax);
            this.Redraw();
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
        //新しい値を計算して境界チェック
        const newvmin=Math.max(this.xmin,Math.min(protvmin,this.xmax));
        const newvmax=Math.max(this.xmin,Math.min(protvmax,this.xmax));
        //境界値を考慮した新しい値に更新
        this.currentvMin=newvmin;
        this.currentvMax=newvmax;
        this.currentcenter=(newvmax+newvmin)/2;
        this.currentradius=(newvmax-newvmin)/2;
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
    const windowingobj=new WindowingClass(SendingData);
});