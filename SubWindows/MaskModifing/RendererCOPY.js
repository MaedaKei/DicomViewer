console.log("MaskModifingRenderer.js loaded");
class MaskModifingClass{
    constructor(SendingData){
        /*画面構成要素の取得*/
        /*
        this.MaskLegendButtonContainer=document.getElementById("MaskLegendButtonContainer");//マスク凡例表示ボタンコンテナ
        this.MaskModifyBeforeButtonContainer=document.getElementById("MaskModifyBeforeButtonContainer");//マスク変更前表示ボタンコンテナ
        this.MaskModifyAfterButtonContainer=document.getElementById("MaskModifyAfterButtonContainer");//マスク変更後表示ボタンコンテナ
        */
        const ButtonContainerIDArray=[
            "MaskLegendButtonContainer",
            "MaskModifyBeforeButtonContainer",
            "MaskModifyAfterButtonContainer"
        ];
        this.ButtonContainerMap=new Map(ButtonContainerIDArray.map((ButtonContainerID)=>[ButtonContainerID,document.getElementById(ButtonContainerID)]));
        this.LabelNameChangeDialogOpenButton=document.getElementById("LabelNameChangeDialogOpenButton");//ラベル名変更ダイアログオープンボタン
        //エリアセレクト用インプット欄
        this.LeftTopXInput=document.getElementById("LeftTopXInput");
        this.LeftTopYInput=document.getElementById("LeftTopYInput");
        this.RectangleWidthInput=document.getElementById("RectangleWidthInput");
        this.RectangleHeightInput=document.getElementById("RectangleHeightInput");
        this.StartSliceInput=document.getElementById("StartSliceInput");
        this.EndSliceInput=document.getElementById("EndSliceInput");

        this.MaskSelectTradeButton=document.getElementById("MaskSelectTradeButton");
        this.MaskModifyConfirmButton=document.getElementById("MaskModifyConfirmButton");
        /*送られてきたデータの解析*/
        const ReceivedDataBody=SendingData.get("data");
        this.TargetCanvasID=ReceivedDataBody.get("CanvasID");
        this.TargetLayer=ReceivedDataBody.get("Layer");
        //初期データから値をセット
        const SelectedArea=ReceivedDataBody.get("SelectedArea");
        this.LeftTopXInput.value=SelectedArea.get("w0");
        this.LeftTopYInput.value=SelectedArea.get("h0");
        this.RectangleWidthInput.value=SelectedArea.get("width");
        this.RectangleHeightInput.value=SelectedArea.get("height");
        this.StartSliceInput.value=SelectedArea.get("startslice");
        this.EndSliceInput.value=SelectedArea.get("endslice");
        //その他の情報の保持
        this.MaskValues=Array.from(ReceivedDataBody.get("histgram").keys());//ヒストグラムの最初の値をマスク値とする
        const colormap=ReceivedDataBody.get("colormap");//ボタンに色情報を付与したらあとは使わない
        this.label=ReceivedDataBody.get("label");//ラベル情報のArray
        this.originalimagewidth=ReceivedDataBody.get("originalimagewidth");
        this.originalimageheight=ReceivedDataBody.get("originalimageheight");
        this.originalslidermax=ReceivedDataBody.get("originalslidermax");//スライダーの最小値は0、最大値はこれ
        
        /*MaskLegendButtonContainerにマスクボタンを配置*/
        /*送られてきたマスクの個数を基に画面のサイズを再計算する*/
        this.MaskButtonMap=new Map();//{maskvalue:{"label":labelName,"ButtonElement":ButtonElement}}
        this.MaskKindNum=this.MaskValues.length;//マスクの種類数、実際のデータに出現しているマスク値の種類。飛んでいる値もあるかもしれない。colormapとlabelはArrayとなっていて、インデックスがマスク値に対応している。
        const MaskLegendButtonContainerFragment=document.createDocumentFragment();
        for(let i=0;i<this.MaskKindNum;i++){
            const MaskValue=this.MaskValues[i];
            const colormapbaseindex=MaskValue*4;//RGBAなので4倍
            const LabelName=this.label[MaskValue];
            const MaskButton=document.createElement("button");
            MaskButton.className="MaskButton";
            MaskButton.value=MaskValue;
            const ColorBoxSpan=document.createElement("span");
            ColorBoxSpan.className="MaskColorBoxSpan";
            //console.log(MaskValue,colormap[MaskValue+0],colormap[MaskValue+1],colormap[MaskValue+2]);
            ColorBoxSpan.style.backgroundColor=`rgb(${colormap[colormapbaseindex+0]},${colormap[colormapbaseindex+1]},${colormap[colormapbaseindex+2]})`;
            const MaskLabelSpan=document.createElement("span");
            MaskLabelSpan.className="MaskLabelSpan";
            MaskLabelSpan.textContent=LabelName;
            const MaskSelectedSpan=document.createElement("span");
            MaskSelectedSpan.className="MaskSelectedSpan";
            MaskSelectedSpan.textContent="";
            const MaskButtonFragment=document.createDocumentFragment();
            MaskButtonFragment.appendChild(ColorBoxSpan);
            MaskButtonFragment.appendChild(MaskLabelSpan);
            MaskButtonFragment.appendChild(MaskSelectedSpan);
            MaskButton.appendChild(MaskButtonFragment);
            MaskLegendButtonContainerFragment.appendChild(MaskButton);
            this.MaskButtonMap.set(MaskValue,new Map([
                ["MaskValue",MaskValue],//ラベル名は変わる可能性があるので、不変であるマスク値をキーとする
                ["ButtonElement",MaskButton]
            ]));
        }
        console.log("button生成終了");
        this.ButtonContainerMap.get("MaskLegendButtonContainer").appendChild(MaskLegendButtonContainerFragment);
        const ButtonFontSize=15;
        const ButtonHeight=ButtonFontSize+7;//px
        const MaskLabelTextSideMargin=5;//px
        const ButtonWidth=2*(ButtonHeight+MaskLabelTextSideMargin)+150;//px
        const ButtonFontStyle=`bold ${ButtonFontSize}px sans-serif`;
        document.documentElement.style.setProperty("--MaskButtonWidth",`${ButtonWidth}px`);
        document.documentElement.style.setProperty("--MaskButtonHeight",`${ButtonHeight}px`);
        document.documentElement.style.setProperty("--MaskButtonFontStyle",ButtonFontStyle);
        document.documentElement.style.setProperty("--MaskLabelTextSideMargin",`${MaskLabelTextSideMargin}px`);
        //legendContainerの設定
        const LegendContainerTitleHeight=20;
        const LegndContainerTitleFontStyle=`bold ${LegendContainerTitleHeight-5}px sans-serif`;
        const LegendContainerGridRowsNum=20;//かならず20行にする
        const LegendContainerGridColumnsNum=Math.ceil(this.MaskKindNum/20);//20行に収まるように列数を決定
        const LegendContainerGridGap=2;
        const LegendContainerPadding=1;
        const LegendContainerWidth=2*LegendContainerPadding+((ButtonWidth+LegendContainerGridGap)*LegendContainerGridColumnsNum-LegendContainerGridGap);
        const LegendContainerHeight=2*LegendContainerPadding+LegendContainerTitleHeight+((ButtonHeight+LegendContainerGridGap)*LegendContainerGridRowsNum-LegendContainerGridGap);
        document.documentElement.style.setProperty("--LegendContainerTitleHeight",`${LegendContainerTitleHeight}px`);
        document.documentElement.style.setProperty("--LegendContainerTitleFontStyle",LegndContainerTitleFontStyle);
        document.documentElement.style.setProperty("--LegendContainerGridRowsNum",`${LegendContainerGridRowsNum}`);
        document.documentElement.style.setProperty("--LegendContainerGridColumnsNum",`${LegendContainerGridColumnsNum}`);
        document.documentElement.style.setProperty("--LegendContainerGridGap",`${LegendContainerGridGap}px`);
        document.documentElement.style.setProperty("--LegendContainerPadding",`${LegendContainerPadding}px`);
        //document.documentElement.style.setProperty("--LegendContainerWidth",`${LegendContainerWidth}px`);
        //document.documentElement.style.setProperty("--LegendContainerHeight",`${LegendContainerHeight}px`);
        //ModifyContainerの設定
        const ModifyContainerTitleHeight=20;
        const ModifyContainerTitleFontStyle=`bold ${ModifyContainerTitleHeight-5}px sans-serif`;
        const ModifyContainerGridRowsNum=LegendContainerGridRowsNum/2;//Legendの半分の行数にする
        const ModifyContainerGridColumnsNum=LegendContainerGridColumnsNum;
        const ModifyContainerGridGap=2;
        const ModifyContainerPadding=1;
        const ModifyContainerWidth=2*ModifyContainerPadding+((ButtonWidth+ModifyContainerGridGap)*ModifyContainerGridColumnsNum-ModifyContainerGridGap);
        const ModifyContainerHeight=2*ModifyContainerPadding+ModifyContainerTitleHeight+((ButtonHeight+ModifyContainerGridGap)*ModifyContainerGridRowsNum-ModifyContainerGridGap);
        document.documentElement.style.setProperty("--ModifyContainerTitleHeight",`${ModifyContainerTitleHeight}px`);
        document.documentElement.style.setProperty("--ModifyContainerTitleFontStyle",ModifyContainerTitleFontStyle);
        document.documentElement.style.setProperty("--ModifyContainerGridRowsNum",`${ModifyContainerGridRowsNum}`);
        document.documentElement.style.setProperty("--ModifyContainerGridColumnsNum",`${ModifyContainerGridColumnsNum}`);
        document.documentElement.style.setProperty("--ModifyContainerGridGap",`${ModifyContainerGridGap}px`);
        document.documentElement.style.setProperty("--ModifyContainerPadding",`${ModifyContainerPadding}px`);
        //document.documentElement.style.setProperty("--ModifyContainerWidth",`${ModifyContainerWidth}px`);
        //document.documentElement.style.setProperty("--ModifyContainerHeight",`${ModifyContainerHeight}px`);
        //ButtonContainerの最終的なサイズを決定する
        const MaskButtonContainerGridGap=3;
        const MaskButtonContaineWidth=LegendContainerWidth+ModifyContainerWidth+MaskButtonContainerGridGap;
        const MaskButtonContainerHeight=Math.max(LegendContainerHeight,ModifyContainerHeight*2+MaskButtonContainerGridGap);
        console.log("MaskButtonContainerSize",MaskButtonContaineWidth,MaskButtonContainerHeight);
        document.documentElement.style.setProperty("--MaskButtonContainerGridGap",`${MaskButtonContainerGridGap}px`);
        document.documentElement.style.setProperty("--MaskButtonContainerWidth",`${MaskButtonContaineWidth}px`);
        document.documentElement.style.setProperty("--MaskButtonContainerHeight",`${MaskButtonContainerHeight}px`);
        //MaskModifyControlContainerのサイズを決定する
        const MaskModifyControlContainerWidth=250;
        const MaskModifyControlContainerHeight=300;
        document.documentElement.style.setProperty("--MaskModifyControlContainerWidth",`${MaskModifyControlContainerWidth}px`);
        document.documentElement.style.setProperty("--MaskModifyControlContainerHeight",`${MaskModifyControlContainerHeight}px`);
        const BodyGap=5;
        document.documentElement.style.setProperty("--BodyGap",`${BodyGap}px`);
        //最終的なコンテンツサイズを決定
        const WindowContentWidth=MaskButtonContaineWidth+MaskModifyControlContainerWidth+BodyGap;
        const WindowContentHeight=Math.max(MaskButtonContainerHeight,MaskModifyControlContainerHeight);
        window.SubWindowResizeAPI(WindowContentWidth,WindowContentHeight);
        //各入力欄のmin,max,stepの設定
        this.LeftTopXInput.min=0;
        this.LeftTopXInput.max=this.originalimagewidth-1;
        this.LeftTopXInput.step=1;
        this.LeftTopYInput.min=0;
        this.LeftTopYInput.max=this.originalimageheight-1;
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
        //メインウィンドウにMultiUseLayerの使用を申請
        this.SendMultiUseLayerSwitching(this.TargetCanvasID,"AreaSelectModeSwitching",true);//ラッパー
        //イベントの登録
        this.ElementsWithEvents=new Map();
        this.setObserverEvents();
        this.setUserEvents();
        this.setSubWindowCloseEvents();
    }
    setObserverEvents(){
        /*
        マウスの挙動を監視する
        監視対象
        マウスダウン、マウスアップ、マウスムーブ
        監視範囲
        body全体
        マウスダウン時とマウスアップ時に、どのButtonContainer内で発生したか記録する
        各ButtonContainerに対してマウスが入ったかどうかの監視を行う
        */
        this.MouseDowned=false;//マウスがダウンしているかどうか
        this.DowningMouseButton=false;//マウスダウンしているボタン
        //this.MouseDownAndMoved=false;//マウスがダウンしている状態でマウスを動かしたときにtrueとなる。mousedownでリセット
        //マウスのbody内の位置情報を保存するMap
        this.MouseTrack=new Map([
            ["previous",new Map([
                ["x",false],
                ["y",false]
            ])],
            ["current",new Map([
                ["x",false],
                ["y",false]
            ])]
        ]);
        //これは各ButtonContainerにマウスが入ったかどうかを監視するためのものであり、ButtonContainerにイベントを設定する
        this.EnteredButtonContainerID=false;//現在マウスが入っているButtonContainerのIDButtonContainer以外はfalseとする
        const ButtonContainerMouseEnterFunction=(e)=>{
            this.EnteredButtonContainerID=e.target.id;
            //this.FlagManager();
        };
        const ButtonContainerMouseLeaveFunction=(e)=>{
            this.EnteredButtonContainerID=false;
            //this.FlagManager();
        }
        for(const [ButtonContainerID,ButtonContainerElement] of this.ButtonContainerMap.entries()){
            this.EventSetHelper(ButtonContainerElement,"mouseenter",ButtonContainerMouseEnterFunction);
            this.EventSetHelper(ButtonContainerElement,"mouseleave",ButtonContainerMouseLeaveFunction);
        }
        //マウスダウンとマウスアップ時にどのButtonContainerにいたかを記録する
        this.ButtonContainerWhenMouseClicked=new Map([
            ["mousedown",false],
            ["mouseup",false]
        ]);
        this.MaskButtonClicked=false;
        this.EventSetHelper(document.body,"mousedown",(e)=>{
            this.MouseDowned=true;
            this.DowningMouseButton=e.button;
            this.ButtonContainerWhenMouseClicked.set("mousedown",this.EnteredButtonContainerID);
            //MaskButtonに対するクリックだったか
            /*
            const MaskButton=e.target.closest("button.MaskButton");
            if(MaskButton){
                this.MaskButtonClicked=true;
            }else{
                this.MaskButtonClicked=false;
            }
            */
            this.FlagManager();
        });
        this.EventSetHelper(document.body,"mousemove",(e)=>{
            //座標を更新
            const oldpoints=this.MouseTrack.get("previous");
            const newpoints=this.MouseTrack.get("current");
            oldpoints.set("x",newpoints.get("x"));
            oldpoints.set("y",newpoints.get("y"));
            newpoints.set("x",e.offsetX);//body内の座標
            newpoints.set("y",e.offsetY);//body内の座標
        });
        this.EventSetHelper(document.body,"mouseup",(e)=>{
            this.MouseDowned=false;
            //this.DowningMouseButton=false;
            this.ButtonContainerWhenMouseClicked.set("mouseup",this.EnteredButtonContainerID);
            this.FlagManager();
        });
    }
    FlagManager(){
        /*MaskButton操作モードかどうかのフラグ*/
        /*
        MaskButton関連のイベント定義
        */
        if(this.DowningMouseButton===0&&this.EnteredButtonContainerID){//どこかのButtonContainerに入っている
            this.MaskButtonOperationFlag=true;
        }else{
            this.MaskButtonOperationFlag=false;
        }
    }
    setUserEvents(){
        /*
        MaskButton関連のイベント定義
        */
        this.MaskButtonOperationFlag=false;
        this.MaskButtonHold=new Map([
            ["HoldFlag",false],
            ["HolddedButtonValueArray",[]],//Number型のリスト
        ]);
        this.MaskButtonOperationFlag=false;
        this.EventSetHelper(document.body,"mousedown",(e)=>{
            //bodyに対して設定する。ユーザーがbuttoncontainer内でのみマウスイベントを発生させるとは限らないから
            if(e.button===0&&this.ButtonContainerWhenMouseClicked.get("mousedown")){//どこかのButtonContainerでマウスダウンを行ったなら
                console.log(this.ButtonContainerWhenMouseClicked.get("mousedown"),"でマウスが押された");
                const TargetButton=e.target.closest("button.MaskButton");//ここは、MaskButtonをクリックするか、Containerの余白をクリックするかわからない
                if(TargetButton){
                    //マウスのクリックor移動イベントがスタートする
                    this.MaskButtonEventActivateFlag
                }else{
                    console.log("余白がクリックされました");
                }
            }else{
                console.log("ButtonContainer外でマウスが押された");
            }
        });
        this.EventSetHelper(document.body,"mousemove",(e)=>{

        });
        //マウスムーブとマウスアップは、なにかしらのボタンをholdしていないなら発生させなくてもいい
        //マウスアップは、ButtonContainer外でボタンを離したときように発生させる必要がある。
        this.EventSetHelper(document.body,"mouseup",(e)=>{
            if(this.ButtonContainerWhenMouseClicked.get("mouseup")){//どこかのButtonContainerでマウスアップが行われた
                console.log(this.ButtonContainerWhenMouseClicked.get("mouseup"),"でマウスが離された");
            }else{
                console.log("ButtonContainer外でマウスが離された");
            }
        });
        /*
        mousedown,mousemove,mouseupはbodyに定義する
        mousedownのときに、e.targetがMaskButtonであればHoldクラスを付与する
        mouseup時に、e.targetがMaskButtonであればHoldクラスを解除し、現在侵入しているButtonContainerの子要素としてButtonを挿入する
        mousemove時に、mouseが押下状態、
        */
        //各入力欄にイベントを登録する
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
        this.FromMainProcessToSubFunctions=new Map();
        const ChangeSelectedAreaFunction=(data)=>{
            const ReceiveDataBody=data.get("data");
            const SelectedAreaData=ReceiveDataBody.get("SelectedArea");
            this.LeftTopXInput.value=SelectedAreaData.get("w0");
            this.LeftTopYInput.value=SelectedAreaData.get("h0");
            this.RectangleWidthInput.value=SelectedAreaData.get("width");
            this.RectangleHeightInput.value=SelectedAreaData.get("height");
            this.StartSliceInput.value=SelectedAreaData.get("startslice");
            this.EndSliceInput.value=SelectedAreaData.get("endslice");
        }
        this.FromMainProcessToSubFunctions.set("ChangeSelectedArea",ChangeSelectedAreaFunction);
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
        console.log("Check",startslice,endslice);
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
        this.SendSelectedArea();
    }
    SendSelectedArea(){//ラッパー
        //範囲選択の変更をメインウィンドウに通知する
        const SelectedArea=new Map([
            ["w0",parseInt(this.LeftTopXInput.value)],
            ["h0",parseInt(this.LeftTopYInput.value)],
            ["width",parseInt(this.RectangleWidthInput.value)],
            ["height",parseInt(this.RectangleHeightInput.value)],
            ["startslice",parseInt(this.StartSliceInput.value)],
            ["endslice",parseInt(this.EndSliceInput.value)],
        ]);
        const data=new Map([
            ["SelectedArea",SelectedArea],
            ["CanvasID",this.TargetCanvasID],
            ["Layer",this.TargetLayer]
        ]);
        /*
        const FromSubToMainProcessData.set("body",new Map([
            ["action","ChangeSelectedArea"],
            ["data",data]
        ]));
        */
        const FromSubToMainProcessData=new Map([
            ["action","ChangeSelectedArea"],
            ["data",data]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    SendMaskChange(){//ラッパー
        //まずは現在の選択範囲を送る
        this.SelectedAreaChange();
        //もしかしたら、マスクチェンジの際にメインウィンドウの方の選択領域を変更処理を挟まないようにやってるかも
        const MaskChangeData=new Map([
            ["w0",parseInt(this.LeftTopXInput.value)],
            ["h0",parseInt(this.LeftTopYInput.value)],
            ["width",parseInt(this.RectangleWidthInput.value)],
            ["height",parseInt(this.RectangleHeightInput.value)],
            ["startslice",parseInt(this.StartSliceInput.value)],
            ["endslice",parseInt(this.EndSliceInput.value)],
            //変更対象も送る
            
        ]);
        const data=new Map([
            ["MaskChangeData",MaskChangeData],
            ["CanvasID",this.TargetCanvasID],
            ["Layer",this.TargetLayer],
        ]);
        //console.log(data);
        const FromSubToMainProcessData=new Map([
            ["action","ChangeMask"],
            ["data",data]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    SendMaskLabelChange(){
        const data=new Map([
            ["label",this.label],

            ["CanvasID",this.TargetCanvasID],
            ["Layer",this.TargetLayer],
        ]);
        /*
        FromSubToMainProcessData.set("body",new Map([
            ["action","ChangeLabel"],
            ["data",data]
        ]));
        */
        const FromSubToMainProcessData=new Map([
            ["action","ChangeLabel"],
            ["data",data]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
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
        //メインプロセスからサブウィンドウの終了連絡がきたときの処理
        window.SubWindowMainProcessAPI.CloseSubWindowFromMainProcessToSub((event,ReceiveData)=>{
            //console.log("SubWindow終了準備");
            const ClosingDataList=[];
            const ClosingData=new Map([
                ["action","AreaSelectModeSwitching"],
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
    const MaskModifingobj=new MaskModifingClass(SendingData);
    window.SubWindowMainProcessAPI.FromMainProcessToSub((event,data)=>{
        MaskModifingobj.ReceiveChangesFromMainWindow(data);
    });
});