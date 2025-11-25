console.log("MaskModifingRenderer.js loaded");
class MaskModifingClass{
    constructor(SendingData){
        //タブボタン
        this.TubButtons=document.getElementsByClassName("TubButton")
        //変更対象入力欄
        //MaskA
        this.MaskASelecterContainer=document.getElementById("MaskASelecterContainer");
        this.MaskASelecter=document.getElementById("MaskASelecter");
        this.MaskALabel=document.getElementById("MaskALabel");
        //MaskB
        this.MaskBSelecterContainer=document.getElementById("MaskBSelecterContainer");
        this.MaskBSelecter=document.getElementById("MaskBSelecter");
        this.MaskBLabel=document.getElementById("MaskBLabel");
        //Swapボタン
        this.SwapButton=document.getElementById("SwapButton");
        //範囲選択入力欄
        this.LeftTopXInput=document.getElementById("LeftTopXInput");
        this.LeftTopYInput=document.getElementById("LeftTopYInput");
        this.RectangleWidthInput=document.getElementById("RectangleWidthInput");
        this.RectangleHeightInput=document.getElementById("RectangleHeightInput");
        this.StartSliceInput=document.getElementById("StartSliceInput");
        this.EndSliceInput=document.getElementById("EndSliceInput");
        const ReceivedDataBody=SendingData.get("data");
        this.TargetCanvasID=ReceivedDataBody.get("CanvasID");
        this.TargetLayer=ReceivedDataBody.get("Layer");
        //確定ボタン
        this.MaskModifyConfirmButton=document.getElementById("MaskModifyConfirmButton");
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
        this.SelecterLength=this.MaskValues.length;
        this.colormap=ReceivedDataBody.get("colormap");
        this.originalimagewidth=ReceivedDataBody.get("originalimagewidth");
        this.originalimageheight=ReceivedDataBody.get("originalimageheight");
        this.originalslidermax=ReceivedDataBody.get("originalslidermax");//スライダーの最小値は0、最大値はこれ
        
        //各入力欄に最大値最小値を設定する
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
        //ラベリングの入力欄とボタン
        this.MaskLabelingTextArea=document.getElementById("MaskLabelingTextArea");
        this.MaskLabelingUpdateButton=document.getElementById("MaskLabelingUpdateButton");
        this.label=ReceivedDataBody.get("label");
        //labelarrayの内容をテキストエリアに表示する
        //console.log(this.label);
        this.MaskLabelingTextArea.value=this.label.join("\n");
        this.colornum=this.MaskValues.length;
        //ラベルの保持が終わってからセレクタ設定する
        this.setMaskSelecters();
        //メインウィンドウにMultiUseLayerの使用を申請
        this.SendMultiUseLayerSwitching(this.TargetCanvasID,"AreaSelectModeSwitching",true);//ラッパー
        //イベントの登録
        this.ElementsWithEvents=new Map();
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
    setMaskSelecters(){
        //マスクセレクタを設定する
        this.MaskASelecter.innerHTML="";
        this.MaskBSelecter.innerHTML="";
        for(let i=0;i<this.colornum;i++){
            const maskvalue=this.MaskValues[i];
            const label=this.label[i];
            const optionA=document.createElement("option");
            optionA.text=`${maskvalue} : ${label}`;
            optionA.value=maskvalue;
            const optionB=optionA.cloneNode(true);
            this.MaskASelecter.appendChild(optionA);
            this.MaskBSelecter.appendChild(optionB);
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
    
    setUserEvents(){
        /*タブボタンの処理*/
        for(const button of this.TubButtons){
            this.EventSetHelper(button,"mouseup",(e)=>{
                if(e.button===0){
                    //まずは全てのタブボタンからactiveを外す
                    for(const btn of this.TubButtons){
                        btn.classList.remove("active");
                    }
                    //クリックされたボタンにactiveを付与する
                    button.classList.add("active");
                    //クリックされたボタンのdata-target属性を取得する
                    const targetscreen=button.getAttribute("data-targetscreen");
                    //全てのScreenから一度displayをnoneにする
                    const screens=document.getElementsByClassName("Screen");
                    for(const screen of screens){
                        screen.style.display="none";
                    }
                    //targetscreenと同じidを持つScreenにactiveを付与する
                    const targetelement=document.getElementById(targetscreen);
                    if(targetelement){
                        targetelement.style.display="block";
                    }
                }
            });
        }
        this.EventSetHelper(this.MaskASelecterContainer,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            const changevalue=Math.sign(e.deltaY);
            const currentValue=parseInt(this.MaskASelecter.value);
            const newvalue=(currentValue+changevalue+this.SelecterLength)%this.SelecterLength;
            this.MaskASelecter.value=newvalue;
            const changeevent=new Event("change");
            this.MaskASelecter.dispatchEvent(changeevent);
        });
        this.EventSetHelper(this.MaskBSelecterContainer,"wheel",(e)=>{
            e.preventDefault();
            e.stopPropagation();
            const changevalue=Math.sign(e.deltaY);
            const currentValue=parseInt(this.MaskBSelecter.value);
            const newvalue=(currentValue+changevalue+this.SelecterLength)%this.SelecterLength;
            this.MaskBSelecter.value=newvalue;
            const changeevent=new Event("change");
            this.MaskBSelecter.dispatchEvent(changeevent);
        });
        /*セレクター変化時に色を変更する*/
        this.EventSetHelper(this.MaskASelecter,"change",(e)=>{
            if(e.target.value!==""){
                const selectedValue=parseInt(e.target.value);
                const r=this.colormap[4*selectedValue+0];
                const g=this.colormap[4*selectedValue+1];
                const b=this.colormap[4*selectedValue+2];
                //const a=this.colormap[4*selectedValue+3]/255;
                //console.log(selectedValue,r,g,b);
                this.MaskALabel.style.backgroundColor=`rgba(${r},${g},${b},1.0)`;
            }
        });
        this.EventSetHelper(this.MaskBSelecter,"change",(e)=>{
            if(e.target.value!==""){
                const selectedValue=parseInt(e.target.value);
                const r=this.colormap[4*selectedValue+0];
                const g=this.colormap[4*selectedValue+1];
                const b=this.colormap[4*selectedValue+2];
                //const a=this.colormap[4*selectedValue+3]/255;
                //console.log(selectedValue,r,g,b,a);
                this.MaskBLabel.style.backgroundColor=`rgba(${r},${g},${b},1.0)`;
            }
        });
        /*セレクターの初期値を設定する*/
        this.MaskASelecter.value=this.MaskValues[0];
        this.MaskBSelecter.value=this.MaskValues[0];
        //changeイベントを発火させる
        let changeevent=new Event("change");
        this.MaskASelecter.dispatchEvent(changeevent);
        this.MaskBSelecter.dispatchEvent(changeevent);

        this.EventSetHelper(this.SwapButton,"mouseup",(e)=>{
            if(e.button===0){
                //左クリックのとき
                const temp=this.MaskASelecter.value;
                this.MaskASelecter.value=this.MaskBSelecter.value;
                this.MaskBSelecter.value=temp;
                //changeイベントを発火させる
                const changeevent=new Event("change");
                this.MaskASelecter.dispatchEvent(changeevent);
                this.MaskBSelecter.dispatchEvent(changeevent);
            }
        });
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
        this.FromMainProcessToMainFunctios=new Map();
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
        this.FromMainProcessToMainFunctios.set("ChangeSelectedArea",ChangeSelectedAreaFunction);
        //確定ボタンの処理
        this.EventSetHelper(this.MaskModifyConfirmButton,"mouseup",(e)=>{
            if(e.button===0){
                //左クリックのとき
                this.SendMaskChange();
            }
        });

        //複数行入力からラベルネームを取得してラベルを更新する
        this.EventSetHelper(this.MaskLabelingUpdateButton,"mouseup",(e)=>{
            if(e.button==0){//左クリックが押されたら
                console.log("押されたよ");
                const newlabels=this.MaskLabelingTextArea.value.split("\n").filter(line=>line.trim()!=="");
                //console.log(newlabel);
                //入力の長さがラベル長より短い場合、ある分だけ入れて他はそのまま
                //入力の長さがラベルより長い場合、入るところまで入れて後は捨てる
                for(let i=0;i<this.colornum;i++){
                    const newlabel=newlabels[i];
                    console.log(newlabel);
                    this.label[i]=newlabel||this.label[i];
                }
                //新しいラベルでセレクタ再構成
                this.setMaskSelecters();
                //新しいラベルをcolormapに通知する
                this.SendMaskLabelChange();
            }
        });
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
        ]) 
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
            ["MaskA",parseInt(this.MaskASelecter.value)],
            ["MaskB",parseInt(this.MaskBSelecter.value)],
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
        this.FromMainProcessToMainFunctios.get(bodyaction)(data);
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