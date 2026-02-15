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
        this.LabelNameChangeDialog=document.getElementById("LabelNameChangeDialog");
        this.LabelNameChangeInputContainer=document.getElementById("LabelNameChangeInputContainer");
        this.LabelNameChangeCancelButton=document.getElementById("LabelNameChangeCancelButton");
        this.LabelNameChangeConfirmButton=document.getElementById("LabelNameChangeConfirmButton");
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
        this.MaskValues=ReceivedDataBody.get("MaskValueArray");//ヒストグラムの最初の値をマスク値とする
        const colormap=ReceivedDataBody.get("ColorMapArray");//ボタンに色情報を付与したらあとは使わない
        const MaskLabel=ReceivedDataBody.get("MaskLabelArray");//ラベル情報のArray
        this.originalimagewidth=ReceivedDataBody.get("originalimagewidth");
        this.originalimageheight=ReceivedDataBody.get("originalimageheight");
        this.originalslidermax=ReceivedDataBody.get("originalslidermax");//スライダーの最小値は0、最大値はこれ
        console.log("最大値",this.originalimagewidth,this.originalimageheight,this.originalslidermax);
        /*MaskLegendButtonContainerにマスクボタンを配置*/
        /*送られてきたマスクの個数を基に画面のサイズを再計算する*/
        this.MaskInfoMap=new Map();//{maskvalue:{"MaskLabel":labelName,"ButtonElement":ButtonElement}}
        this.MaskKindNum=this.MaskValues.length;//マスクの種類数、実際のデータに出現しているマスク値の種類。飛んでいる値もあるかもしれない。colormapとlabelはArrayとなっていて、インデックスがマスク値に対応している。
        const MaskLegendButtonContainerFragment=document.createDocumentFragment();
        const LabelNameChangeInputContainerFragment=document.createDocumentFragment();
        for(let i=0;i<this.MaskKindNum;i++){
            const MaskValue=this.MaskValues[i];
            const colormapbaseindex=MaskValue*4;//RGBAなので4倍
            const LabelName=MaskLabel[MaskValue];
            const MaskButton=document.createElement("button");
            MaskButton.className="MaskButton";
            MaskButton.tabIndex="-1";
            MaskButton.value=MaskValue;
            const ColorBoxSpan=document.createElement("span");
            ColorBoxSpan.className="MaskColorBoxSpan";
            //console.log(MaskValue,colormap[MaskValue+0],colormap[MaskValue+1],colormap[MaskValue+2]);
            ColorBoxSpan.style.backgroundColor=`rgb(${colormap[colormapbaseindex+0]},${colormap[colormapbaseindex+1]},${colormap[colormapbaseindex+2]})`;
            const MaskLabelSpan=document.createElement("span");
            MaskLabelSpan.className="MaskLabelSpan";
            MaskLabelSpan.textContent=LabelName;
            const MaskClickedSpan=document.createElement("span");
            MaskClickedSpan.className="MaskClickedSpan";
            MaskClickedSpan.textContent="";
            const MaskButtonFragment=document.createDocumentFragment();
            MaskButtonFragment.appendChild(ColorBoxSpan);
            MaskButtonFragment.appendChild(MaskLabelSpan);
            MaskButtonFragment.appendChild(MaskClickedSpan);
            MaskButton.appendChild(MaskButtonFragment);
            MaskLegendButtonContainerFragment.appendChild(MaskButton);
            //ダイアログを作成
            const InputBlockDiv=document.createElement("div");
            const InputColorBoxSpan=ColorBoxSpan.cloneNode(false);
            const TextInput=document.createElement("input");
            TextInput.type="text";
            const InputBlockDivFragment=document.createDocumentFragment();
            InputBlockDivFragment.appendChild(InputColorBoxSpan);
            InputBlockDivFragment.appendChild(TextInput);
            InputBlockDiv.appendChild(InputBlockDivFragment);
            LabelNameChangeInputContainerFragment.appendChild(InputBlockDiv);

            this.MaskInfoMap.set(MaskValue,new Map([//ラベル名は変わる可能性があるので、不変であるマスク値をキーとする
                ["MaskLabel",MaskLabel[MaskValue]],
                ["ButtonElement",MaskButton],
                ["TextInput",TextInput]
            ]));
        }
        console.log("button生成終了");
        this.ButtonContainerMap.get("MaskLegendButtonContainer").appendChild(MaskLegendButtonContainerFragment);
        this.LabelNameChangeInputContainer.appendChild(LabelNameChangeInputContainerFragment);
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
        /*Dialogの画面サイズを決定*/
        const InputFontSize=12;
        const InputHeight=InputFontSize+5;
        const InputWidth=InputHeight+120;//正方形のカラーボックスと入力部分
        const LabelNameChangeButtonContainerHeight=30;
        const LabelNameChangeInputContainerGridRowsNum=Math.min(20,this.MaskKindNum);
        const LabelNameChangeInputContainerGridColumnsNum=Math.ceil(this.MaskKindNum/20);
        const LabelNameChangeInputContainerGridGap=1;
        const LabelNameChangeInputContainerWidth=(InputWidth+LabelNameChangeInputContainerGridGap)*LabelNameChangeInputContainerGridColumnsNum-LabelNameChangeInputContainerGridGap;
        const LabelNameChangeInputContainerHeight=(InputHeight+LabelNameChangeInputContainerGridGap)*LabelNameChangeInputContainerGridRowsNum-LabelNameChangeInputContainerGridGap;
        document.documentElement.style.setProperty("--InputWidth",`${InputWidth}px`);
        document.documentElement.style.setProperty("--InputHeight",`${InputHeight}px`);
        document.documentElement.style.setProperty("--LabelNameChangeInputContainerWidth",`${LabelNameChangeInputContainerWidth}px`);
        document.documentElement.style.setProperty("--LabelNameChangeInputContainerHeight",`${LabelNameChangeInputContainerHeight}px`);
        document.documentElement.style.setProperty("--LabelNameChangeButtonContainerHeight",`${LabelNameChangeButtonContainerHeight}px`);
        document.documentElement.style.setProperty("--LabelNameChangeInputContainerGridGap",`${LabelNameChangeInputContainerGridGap}px`);
        document.documentElement.style.setProperty("--LabelNameChangeInputContainerGridRowsNum",`${LabelNameChangeInputContainerGridRowsNum}`);
        document.documentElement.style.setProperty("--LabelNameChangeInputContainerGridColumnsNum",`${LabelNameChangeInputContainerGridColumnsNum}`);
        //適したwindowサイズに変更
        window.SubWindowResizeAPI(WindowContentWidth,WindowContentHeight);
        window.SubWindowMoveAPI();
        //ダイアログの表示を初期化
        this.UpdateLabelNameChangeDialogPlaceholder();
        this.ButtonHeight=ButtonHeight;
        this.ButtonGap=ModifyContainerGridGap;
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
        this.SwitchedMode=["AreaSelectModeSwitching","MASKClickModeSwitching"];
        for(const Mode of this.SwitchedMode){
            this.SendMultiUseLayerSwitching(this.TargetCanvasID,Mode,true);
        }
        //this.SendMultiUseLayerSwitching(this.TargetCanvasID,"AreaSelectModeSwitching",true);//ラッパー
        //this.SendMultiUseLayerSwitching(this.TargetCanvasID,"MASKClickModeSwitching",true);
        //イベントの登録
        this.ElementsWithEvents=new Map();
        this.FromMainProcessToSubFunctions=new Map();
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
            //e.target.classList.add("Entered");
            //this.FlagManager();
        };
        const ButtonContainerMouseLeaveFunction=(e)=>{
            this.EnteredButtonContainerID=false;
            //e.target.classList.remove("Entered");
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
        this.EventSetHelper(document,"mousedown",(e)=>{
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
        this.EventSetHelper(document,"mousemove",(e)=>{
            //座標を更新
            const oldpoints=this.MouseTrack.get("previous");
            const newpoints=this.MouseTrack.get("current");
            oldpoints.set("x",newpoints.get("x"));
            oldpoints.set("y",newpoints.get("y"));
            newpoints.set("x",e.pageX);//body内の座標
            newpoints.set("y",e.pageY);//body内の座標
        });
        this.EventSetHelper(document,"mouseup",(e)=>{
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
        if(this.ButtonContainerWhenMouseClicked.get("mousedown")){//どこかのButtonContainerに入っている
            this.MaskButtonOperationFlag=true;
            this.LabelNameModifyFlag=false;
            this.MaskModifyFlag=false;
        }else{
            this.MaskButtonOperationFlag=false;
            this.LabelNameModifyFlag=true;
            this.MaskModifyFlag=true;
        }
    }
    setUserEvents(){
        /*
        MaskButton関連のイベント定義
        */
        this.MaskButtonOperationFlag=false;
        this.MovingButtonArray=[];//Elementそのものを入れる
        this.MaskButtonMouseDowned=false;
        const dammyButton=document.createElement("button");
        dammyButton.classList="DammyButton";
        this.dammyButton=dammyButton;
        this.MouseDownTimer=false;//マウスダウン長押し
        this.MaskButtonMovable=false;
        this.EventSetHelper(document,"mousedown",(e)=>{
            //bodyに対して設定する。ユーザーがbuttoncontainer内でのみマウスイベントを発生させるとは限らないから
            if(e.button===0&&this.MaskButtonOperationFlag){//どこかのButtonContainerでマウスダウンを行ったなら
                const TargetButton=e.target.closest("button.MaskButton");//ここは、MaskButtonをクリックするか、Containerの余白をクリックするかわからない
                if(TargetButton){
                    //マウスのクリックor移動イベントがスタートする
                    this.MaskButtonMouseDowned=true;
                    //マウスダウン対象ボタンにはMouseDownedクラスを付与する。これはmousemove時、またはmouseup時に解除される
                    TargetButton.classList.add("MouseDowned");
                }else{
                    this.MaskButtonMouseDowned=false;
                }
                //movableタイマースタート
                this.MouseDownTimer=setTimeout(()=>{
                    this.MaskButtonMovable=true;
                },100);//200ms後にマウスムーブ有効化になる
            }
        });
        //ボタンの上から離れたらタイマーリセットのみ行う。MaskButtonMovableはリセットしない。MaskButtonMovableのリセットはMouseUp時のみ。あくまでMaskButtonMovableの有効化の阻害のみ
        
        this.EventSetHelper(document,"mouseout",(e)=>{
            if(this.MaskButtonMouseDowned){//押された後にmouseoutした＝押されたボタンから一度離れた
                const MouseOutedButton=e.target.closest("button.MaskButton");
                if(MouseOutedButton){
                    clearTimeout(this.MouseDownTimer);
                }
            }
        });
        
        this.MaskButtonMoved=false;
        //ボタン要素を移動できるようになる条件
        //ボタンの上で200ms以上長押しする＆＆mousemove発火
        this.EventSetHelper(document,"mousemove",(e)=>{
            if(this.MaskButtonMovable&&this.MaskButtonMouseDowned){//MaskButtonOperationFlagが有効、かつMaskButton上でマウスダウンが発生してあとのmousemoveなら
                /*
                2つの動きがある
                MaskButtonMouseDownedの後はじめてのmousemoveのとき
                対象となるButtonを移動用Mapに登録⇒ButtonContainerからbodyの子要素に変更⇒マウスの位置に従って表示変更
                */
                if(this.MovingButtonArray.length===0){//まだ何も入っていない＝MouseDownedされて初めてのMouseMove
                    //移動対象となるのは、MouseDownもしくはSelectedクラスがついているMaskButtonである。
                    //console.log("mousemoveしたよ");
                    const TargetButtonContainer=this.ButtonContainerMap.get(this.ButtonContainerWhenMouseClicked.get("mousedown"));
                    const MoveTargetMaskButtonArray=TargetButtonContainer.querySelectorAll(":scope>button.MaskButton.MouseDowned, :scope>button.MaskButton.Selected");
                    const BodyFragment=document.createDocumentFragment();
                    for(const MoveTargetMaskButton of MoveTargetMaskButtonArray){
                        this.MovingButtonArray.push(MoveTargetMaskButton);  
                        BodyFragment.appendChild(MoveTargetMaskButton);
                    }
                    document.body.appendChild(BodyFragment);
                }
                //console.log("動いてる");
                //this.movingButtonArray内のボタンの表示位置を変更する
                const CurrentMousePosition=this.MouseTrack.get("current");
                const x=CurrentMousePosition.get("x");
                const y=CurrentMousePosition.get("y");
                const OffsetYBase=this.ButtonHeight/*+this.ButtonGap*/;
                this.MovingButtonArray.forEach((Button,index)=>{
                    //マウスに被るとイベント発火の妨げになるので、現時点ではマウスポインタから少しずらした位置に表示させるようにする。CSSでbuttonに対してマウスイベント発火の防止を指定できるかも
                    const OffsetX=`${x+3}px`;
                    const OffsetY=`${y+index*OffsetYBase+3}px`;
                    Button.style.left=OffsetX;
                    Button.style.top=OffsetY;
                    //Button.style.zIndex=10;
                    //console.log("z-index",Button.style.zIndex);
                });
                if(!this.MaskButtonMoved){
                    this.MaskButtonMoved=true;
                }
            }else{
                this.MaskButtonMoved=false;
            }
        });
        //各ButtonContainerにイベント登録
        const ButtonContainerAndMaskButtonMouseOverFunction=(e)=>{
            if(this.MaskButtonMoved){
                const MouseOverOriginalTarget=e.target;
                if(MouseOverOriginalTarget!==this.dammyButton){
                    const MouseOverTarget=MouseOverOriginalTarget.closest("button.MaskButton");
                    //ターゲットがボタンなら
                    if(MouseOverTarget){
                        //ターゲットボタンの前にdammyButtonを挿入
                        const TargetButtonContainer=MouseOverTarget.parentElement;
                        TargetButtonContainer.insertBefore(this.dammyButton,MouseOverTarget);
                        //this.dammyButton.display="";
                    }else{
                        //余白だった
                        const TargetButtonContainer=MouseOverOriginalTarget;
                        TargetButtonContainer.appendChild(this.dammyButton);
                        //this.dammyButton.display="";
                    }
                }
            }
        }
        const ButtonContainerLeaveFunction=(e)=>{
            //ButtonContainerからはなれたらdammyButtonは削除する
            if(this.MaskButtonMoved){
                this.dammyButton.remove();
            }
        }
        for(const ButtonContainerElement of this.ButtonContainerMap.values()){
            this.EventSetHelper(ButtonContainerElement,"mouseover",ButtonContainerAndMaskButtonMouseOverFunction);
            this.EventSetHelper(ButtonContainerElement,"mouseleave",ButtonContainerLeaveFunction);
        }
        //マウスムーブとマウスアップは、なにかしらのボタンをholdしていないなら発生させなくてもいい
        //マウスアップは、ButtonContainer外でボタンを離したときように発生させる必要がある。
        this.EventSetHelper(document,"mouseup",(e)=>{
            //MaskButtonOperationFlagは、マウスダウンがButtonContainer内で起こったときにtrueとなる
            //つまり、どの場所でmouseupが発生したかわからないが、MaskButtonOperationの後始末をする必要がある。
            if(e.button===0&&this.MaskButtonOperationFlag){
                /*
                行う処理
                Selectの全解除⇒MaskButtonMouseDowned=false,　MouseMove=false,　mousedown時のButtonContainerが対象となる。
                Selectの切り替え⇒MaskButtonMouseDowned=true,　MouseMove=false,　mousedown時のButtonContainerが対象となる。
                MaskButtonの移動のリセット⇒MaskButtonMouseDowned=true,　MauseMove=true,　mouseup時にButtonContainerにいなかった場合、LegendContainerに移動中のMaskButtonを戻す
                MaskButtonの移動⇒MaskButtonMouseDowned=true,　MauseMove=true,　mouseup時にButtonContainerにいた場合、mouseup時のButtonContainer内のButtonの上で発生したか否かでかわる
                */  
                if(this.MaskButtonMoved){
                    let TargetButtonContainer=this.ButtonContainerMap.get("MaskLegendButtonContainer");
                    if(this.ButtonContainerWhenMouseClicked.get("mouseup")){//どこかのButtonContainerにボタンが落とされた
                        const TargetButtonContainerKey=this.ButtonContainerWhenMouseClicked.get("mouseup");
                        TargetButtonContainer=this.ButtonContainerMap.get(TargetButtonContainerKey);
                        /*
                        const TargetButtonContainerFragment=document.createDocumentFragment();
                        for(const Button of this.MovingButtonArray){
                            Button.classList.remove("Selected","MouseDowned");
                            TargetButtonContainerFragment.appendChild(Button);
                        }
                        TargetButtonContainer.replaceChild(TargetButtonContainerFragment,this.dammyButton);
                        */
                    }
                    //TargetContainerがLegendButtonContainerならば、入っているButtonの順番が変わらないようにする。
                    const MoveToMaskLegendFlag=(TargetButtonContainer===this.ButtonContainerMap.get("MaskLegendButtonContainer"));
                    let InsertPositionButton=this.dammyButton;
                    if(MoveToMaskLegendFlag){
                        //this.MovingButtonArrayにMaskLegendButtonContainer内のボタンを追加する。
                        const MaskLegendButtonArray=TargetButtonContainer.querySelectorAll(":scope>button.MaskButton");
                        //順番を整理してMovingButtonArrayに凡例内のラベルもすべて入れる
                        this.MovingButtonArray=[...this.MovingButtonArray,...MaskLegendButtonArray].sort((Button1,Button2)=>{
                            const MaskValue1=parseInt(Button1.value);
                            const MaskValue2=parseInt(Button2.value);
                            return MaskValue1-MaskValue2;
                        });
                        //MASKLegendなのでnullでもよい。移動先がここのときは、ボタンコンテナ外でマウスを離したときも含まれるのでnullにしてしまう
                        InsertPositionButton=null;
                    }
                    const TargetButtonContainerFragment=document.createDocumentFragment();
                    for(const Button of this.MovingButtonArray){
                        Button.classList.remove("Selected","MouseDowned");
                        TargetButtonContainerFragment.appendChild(Button);
                    }
                    //dammyButtonがある位置から挿入するようにしたい
                    //しかし、ButtonContainerエリア系以外にマウスがあるとdammyButtonが消える
                    TargetButtonContainer.insertBefore(TargetButtonContainerFragment,InsertPositionButton);
                    this.dammyButton.remove();//挿入位置を示すダミーボタンをDOMツリーから削除する
                }else{
                    /*
                    Selectクラスの切り替えモード
                    */
                    //const SelectedClass="Selected";
                    if(this.MaskButtonMouseDowned){
                        //個別の切り替え
                        const ClickedButton=e.target.closest("button.MaskButton");
                        if(ClickedButton){
                            /*画像のクリックからのSelect切り替えでも一応MouseDownedを削除する*/
                            ClickedButton.classList.remove("MouseDowned");
                            this.ChangeMASKSelect(ClickedButton);
                        }
                    }else{
                        /*
                        //MouseDown時のButtonContainer内のMaskButtonのSelectedクラスを消す
                        const TargetButtonContainerKey=this.ButtonContainerWhenMouseClicked.get("mousedown");
                        const TargetButtonContainer=this.ButtonContainerMap.get(TargetButtonContainerKey);
                        for(const MaskButton of TargetButtonContainer.children){
                            //console.log(MaskButton);
                            MaskButton.classList.remove("Selected");
                        }
                        */
                        //コンテナの余白クリック時はどこであってもすべてのボタンのSelectを解除する
                        this.ChangeMASKSelect();
                        //コンテナの余白クリックでMaskButtonのClickedを解除する
                        this.ChangeMASKClick();
                    }
                }
                this.MaskButtonMoved=false;
                this.MaskButtonMouseDowned=false;
                this.MovingButtonArray=[];
                //マウスダウンタイマーリセット&&スタイルリセット
                this.MaskButtonMovable=false;
                clearTimeout(this.MouseDownTimer);
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
            const CurrentValue=parseInt(element.value);
            element.setAttribute("data-CurrentValue",CurrentValue);
            this.EventSetHelper(element,"keydown",(e)=>{
                if(e.code==="Enter"){
                    const TargetElement=e.target;
                    const NewValue=parseInt(TargetElement.value);
                    const CurrentValue=parseInt(TargetElement.getAttribute("data-CurrentValue"));
                    if(Number.isFinite(NewValue)&&NewValue!==CurrentValue){
                        //CurrentValueを更新
                        TargetElement.setAttribute("data-CurrentValue",NewValue);
                        //有効な値であるので値の精査にはいる
                        this.SelectedAreaChange();
                    }else{
                        //有効な値ではないので変更はされない
                        TargetElement.value=CurrentValue;
                    }
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
        /*
        const ChangeSelectedAreaFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const SelectedAreaData=ReceivedDataBody.get("SelectedArea");
            const w0=SelectedAreaData.get("w0");
            //this.LeftTopXInput.value=w0;
            //this.LeftTopXInput.setAttribute("data-CurrentValue",w0);
            const h0=SelectedAreaData.get("h0");
            //this.LeftTopYInput.value=h0;
            //this.LeftTopYInput.setAttribute("data-CurrentValue",h0);
            const width=SelectedAreaData.get("width");
            
            //this.RectangleWidthInput.value=width;
            //this.RectangleWidthInput.setAttribute("data-CurrentValue",width);
            const height=SelectedAreaData.get("height");
            //this.RectangleHeightInput.value=height;
            //this.RectangleHeightInput.setAttribute("data-CurrentValue",height);
            const startslice=SelectedAreaData.get("startslice");
            //this.StartSliceInput.value=startslice;
            //this.StartSliceInput.setAttribute("data-CurrentValue",startslice);
            const endslice=SelectedAreaData.get("endslice");
            //this.EndSliceInput.value=SelectedAreaData.get("endslice");
            //this.EndSliceInput.setAttribute("data-CurrentValue",endslice);
            this.SetNewValue(w0,h0,width,height,startslice,endslice);
        }
        */
        //this.FromMainProcessToSubFunctions.set("ChangeSelectedArea",ChangeSelectedAreaFunction);
        this.FromMainProcessToSubFunctions.set("ChangeSelectedArea",(data)=>this.ReceiveSelectedAreaFunction(data));
        //各ボタンにイベントを登録する
        this.LabelNameModifyFlag=true;
        this.EventSetHelper(this.LabelNameChangeDialogOpenButton,"mouseup",(e)=>{
            if(this.LabelNameModifyFlag&&e.button===0){
                this.LabelNameChangeDialog.showModal();
            }
        });
        this.EventSetHelper(this.LabelNameChangeCancelButton,"mouseup",(e)=>{
            if(this.LabelNameModifyFlag&&e.button===0){
                this.LabelNameChangeDialog.close();
            }
        });
        this.EventSetHelper(this.LabelNameChangeCancelButton,"keydown",(e)=>{
            if(this.LabelNameModifyFlag&&e.code==="Enter"){
                this.LabelNameChangeDialog.close();
            }
        });
        this.EventSetHelper(this.LabelNameChangeConfirmButton,"mouseup",(e)=>{
            if(this.LabelNameModifyFlag&&e.button===0){
                this.ChangeLabelName();
            }
        });
        this.EventSetHelper(this.LabelNameChangeConfirmButton,"keydown",(e)=>{
            if(this.LabelNameModifyFlag&&e.code==="Enter"){
                this.ChangeLabelName();
            }
        });
        this.MaskModifyFlag=true;
        this.EventSetHelper(this.MaskModifyConfirmButton,"mouseup",(e)=>{
            if(this.MaskModifyFlag&&e.button===0){
                this.SendMaskChange();
            }
        });
        this.EventSetHelper(this.MaskModifyConfirmButton,"keydown",(e)=>{
            if(this.MaskModifyFlag&&e.code==="Enter"){
                this.SendMaskChange();
            }
        });
        this.EventSetHelper(this.MaskSelectTradeButton,"mouseup",(e)=>{
            if(this.MaskModifyFlag&&e.button===0){
                const MaskModifyBeforeButtonContainer=this.ButtonContainerMap.get("MaskModifyBeforeButtonContainer");
                const BeforeMaskButtonArray=MaskModifyBeforeButtonContainer.querySelectorAll(":scope>button.MaskButton");
                const MaskModifyAfterButtonContainer=this.ButtonContainerMap.get("MaskModifyAfterButtonContainer");
                const AfterMaskButtonArray=MaskModifyAfterButtonContainer.querySelectorAll(":scope>button.MaskButton");
                //入れ替え開始
                if(AfterMaskButtonArray.length>0){
                    const MaskModifyBeforeButtonContainerFragment=document.createDocumentFragment();
                    for(const AfterMaskButton of AfterMaskButtonArray){
                        MaskModifyBeforeButtonContainerFragment.appendChild(AfterMaskButton);
                    }
                    MaskModifyBeforeButtonContainer.appendChild(MaskModifyBeforeButtonContainerFragment);
                }
                if(BeforeMaskButtonArray.length>0){
                    const MaskModifyAfterButtonContainerFragment=document.createDocumentFragment();
                    for(const BeforeMaskButton of BeforeMaskButtonArray){
                        MaskModifyAfterButtonContainerFragment.appendChild(BeforeMaskButton);
                    }
                    MaskModifyAfterButtonContainer.appendChild(MaskModifyAfterButtonContainerFragment);
                }
            }
        });
        /*(MASKClicked) MainWindowから、MaskClicked通知が送られてくる*/
        const MASKClickedFunction=(data)=>{
            const ReceivedDataBody=data.get("data");
            const ClickedMASKValue=ReceivedDataBody.get("ClickedMASKValue");
            const TargetButton=this.MaskInfoMap.get(ClickedMASKValue).get("ButtonElement");
            this.ChangeMASKClick(TargetButton);
        }
        this.FromMainProcessToSubFunctions.set("MASKClicked",MASKClickedFunction);

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
    ChangeMASKSelect(TargetButton=false){
        /*画像のクリックからのSelect切り替えでも一応MouseDownedを削除する*/
        /*画像のクリックではSelectにはせず、ハイライト表示にとどめる*/
        const SelectedClass="Selected";
        if(TargetButton){
            if(TargetButton.classList.contains(SelectedClass)){
                TargetButton.classList.remove(SelectedClass);
                //console.log(TargetButton.value,SelectedClass,"削除した");
            }else{
                TargetButton.classList.add(SelectedClass);
            }
        }else{
            //ボタンを指定しない場合はリセットとして働く
            for(const MaskInfo of this.MaskInfoMap.values()){
                MaskInfo.get("ButtonElement").classList.remove(SelectedClass);
            }
        }
    }
    ChangeMASKClick(TargetButton=false){
        const ClickedClass="Clicked";
        //すべてのClickedを解除
        for(const MaskInfo of this.MaskInfoMap.values()){
            MaskInfo.get("ButtonElement").classList.remove(ClickedClass);
        }
        if(TargetButton){
            //ボタンしていない場合はリセットとして働く
            TargetButton.classList.add(ClickedClass);
        }
    }
    UpdateLabelNameChangeDialogPlaceholder(){
        for(const MaskInfo of this.MaskInfoMap.values()){
            const MaskLabel=MaskInfo.get("MaskLabel");
            const TextInput=MaskInfo.get("TextInput");
            TextInput.placeholder=MaskLabel;
        }
    }
    ChangeLabelName(){
        //各Inputのvalueを集計
        for(const [MaskValue,MaskInfo] of this.MaskInfoMap.entries()){
            const TextInput=MaskInfo.get("TextInput")
            const NewLabel=TextInput.value;
            //console.log(MaskValue,NewLabel);
            if(NewLabel!==""){
                MaskInfo.set("MaskLabel",NewLabel);
                const ButtonElement=MaskInfo.get("ButtonElement");
                const MaskLabelSpan=ButtonElement.querySelector(":scope>span.MaskLabelSpan");
                MaskLabelSpan.textContent=NewLabel;
                //placeholderを変更
                TextInput.placeholder=NewLabel;
                TextInput.value="";
            }
        }
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
        /*
        this.LeftTopXInput.value=w0;
        this.LeftTopYInput.value=h0;
        this.RectangleWidthInput.value=width;
        this.RectangleHeightInput.value=height;
        //console.log("Check",startslice,endslice);
        this.StartSliceInput.value=startslice;
        this.EndSliceInput.value=endslice;
        */
        this.SetNewValue(w0,h0,width,height,startslice,endslice);
        //値を確定後、メインウィンドウに通知
        this.SendSelectedArea();
    }
    ReceiveSelectedAreaFunction(data){
        console.log("インスタンスメソッドも行けるんだね");
        const ReceivedDataBody=data.get("data");
        const SelectedAreaData=ReceivedDataBody.get("SelectedArea");
        const w0=SelectedAreaData.get("w0");
        const h0=SelectedAreaData.get("h0");
        const width=SelectedAreaData.get("width");
        const height=SelectedAreaData.get("height");
        const startslice=SelectedAreaData.get("startslice");
        const endslice=SelectedAreaData.get("endslice");
        this.SetNewValue(w0,h0,width,height,startslice,endslice);
    }
    SetNewValue(w0,h0,width,height,startslice,endslice){
        this.LeftTopXInput.value=w0;
        this.LeftTopXInput.setAttribute("data-CurrentValue",w0);
        this.LeftTopYInput.value=h0;
        this.LeftTopYInput.setAttribute("data-CurrentValue",h0);
        this.RectangleWidthInput.value=width;
        this.RectangleWidthInput.setAttribute("data-CurrentValue",width);
        this.RectangleHeightInput.value=height;
        this.RectangleHeightInput.setAttribute("data-CurrentValue",height);
        this.StartSliceInput.value=startslice;
        this.StartSliceInput.setAttribute("data-CurrentValue",startslice);
        this.EndSliceInput.value=endslice;
        this.EndSliceInput.setAttribute("data-CurrentValue",endslice);
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
        console.log("SendSelectedArea",SelectedArea);
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
        //個数チェック
        const MaskModifyBeforeButtonContainer=this.ButtonContainerMap.get("MaskModifyBeforeButtonContainer");
        const BeforeMaskButtonArray=MaskModifyBeforeButtonContainer.querySelectorAll(":scope>button.MaskButton");
        const MaskModifyAfterButtonContainer=this.ButtonContainerMap.get("MaskModifyAfterButtonContainer");
        const AfterMaskButtonArray=MaskModifyAfterButtonContainer.querySelectorAll(":scope>button.MaskButton");
        if(BeforeMaskButtonArray.length!==AfterMaskButtonArray.length){
            console.log("変更前と変更後は対応する位置同士で変換が行われるため、同じ数だけ指定されている必要があります。");
        }else{
            /*
            変更データの形式
            {BeforeMaskValue:AfterMaskValue,...,}の形式とする
            */
            const ChangeMaskMap=new Map();
            const ChangeMaskNum=BeforeMaskButtonArray.length;
            for(let i=0;i<ChangeMaskNum;i++){
                const BeforeMaskValue=parseInt(BeforeMaskButtonArray[i].value);
                const AfterMaskValue=parseInt(AfterMaskButtonArray[i].value);
                ChangeMaskMap.set(BeforeMaskValue,AfterMaskValue);
            }
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
                ["ChangeMaskMap",ChangeMaskMap]
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
    }
    /*
    SendMaskLabelChange(){
        const data=new Map([
            ["MaskLabel",label],

            ["CanvasID",this.TargetCanvasID],
            ["Layer",this.TargetLayer],
        ]);
        const FromSubToMainProcessData=new Map([
            ["action","ChangeLabel"],
            ["data",data]
        ]);
        this.PassChangesToMainWindow(FromSubToMainProcessData);
    }
    */
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
            /*
            const AreaSelectModeSwitchingData=new Map([
                ["action","AreaSelectModeSwitching"],
                ["data",new Map([
                    ["CanvasID",this.TargetCanvasID],
                    ["Activate",false]
                ])]
            ]);
            ClosingDataList.push(AreaSelectModeSwitchingData);
            */
            for(const Mode of this.SwitchedMode){
                const ModeSwitchingData=new Map([
                    ["action",Mode],
                    ["data",new Map([
                        ["Activate",false],
                        ["CanvasID",this.TargetCanvasID],
                        ["Layer",this.TargetLayer],
                    ])]
                ]);
                ClosingDataList.push(ModeSwitchingData);
            }
            //現時点でのマスクラベルを送信
            const NewLabelArray=Array.from(this.MaskInfoMap.values()).map((MaskInfo)=>MaskInfo.get("MaskLabel"));
            const ChangeLabelData=new Map([
                ["action","ChangeLabel"],
                ["data",new Map([
                    ["MaskLabel",NewLabelArray],
                    ["CanvasID",this.TargetCanvasID],
                    ["Layer",this.TargetLayer],
                ])]
            ]);
            ClosingDataList.push(ChangeLabelData);
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