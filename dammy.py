lass RTSS:
    def __init__(self,rtss_filepath,index2position_dict,position2index_dict):
        #読み込む
        rtss=dicom.dcmread(rtss_filepath)
        structures={}
        for roi in rtss.StructureSetROISequence:
            structures[roi.ROINumber]=roi.ROIName
        
        contours={}
        for contour in rtss.ROIContourSequence:
            #iは色決定に使う
            #このcontourの組織名を取得
            structure=structures[contour.ReferencedROINumber]
            if not hasattr(contour,"ContourSequence"):
                continue
            contours[structure]={}
            contours[structure]["ROINumber"]=contour.ReferencedROINumber
            points={}
            for c in contour.ContourSequence:
                if c.ContourGeometricType!="CLOSED_PLANAR":#閉じていない輪郭はスキップ
                    continue
                contour_data=c.ContourData
                x=[float(x) for x in contour_data[0::3]]
                y=[float(y) for y in contour_data[1::3]]
                z=float(contour_data[2])
                xy=list(zip(x,y))
                xy.append(xy[0])#視点と終点をつなげる
                #同じz座標に同じ臓器の輪郭がある場合がある
                #例えば精嚢とか
                if z not in points:
                    points[z]=[]
                points[z].append(xy)#[[(x,y),(x,y),(x,y)...],]
            #これは表示に使わないしいらないかも
            #contours[structure]["points"]=points

            #表示用のPathを作成
            paths={}
            for z,p in points.items():
                _all_paths=[]
                _all_codes=[]
                for i,c in enumerate(p):
                    codes=np.ones(len(c))*Path.LINETO
                    codes[0]=Path.MOVETO
                    codes[-1]=Path.CLOSEPOLY
                    _all_paths.append(c)
                    _all_codes.append(codes)
                path=Path(np.concatenate(_all_paths),np.concatenate(_all_codes))
                paths[z]=path#z座標をkeyとするxy座標
            contours[structure]["paths"]=paths
            #輪郭更新の際に必要になるオブジェクトの場所を確保
            #<class 'matplotlib.patches.PathPatch'>
            contours[structure]["pathpatch"]=None
        #countoursを並び替えたい
        contours={ structure:contour for structure,contour in sorted(contours.items(),key=lambda x:x[1]["ROINumber"])}
        colors=colormap(len(contours),ALPHA=0.15)
        for structure_contour,color in zip(contours.values(),colors):
            structure_contour["ec"]=color[0:3]
            structure_contour["fc"]=color
        """
        contours=strucureName
                    ├points={z=1:[[(x,y),...],[(x,y),...]],z=2:}
                    ├Paths={z=1:path,z=2:path,...}
                    ├ec=(R,G,B)
                    ├fc=(R,G,B,a)
                    ├pathpatch <class 'matplotlib.patches.PathPatch'>
        """
        self.contours=contours
        self.i2p=index2position_dict
        self.p2i=position2index_dict
        """
        for k,v in self.i2p.items():
            print(k,v)
        """
        print("RTSS読み込み完了")
    def get(self,i,structure):
        #指定した組織のインデックスに対応する輪郭PATHを取り出す
        position=self.i2p[i]
        paths=self.contours[structure]["paths"]
        path=paths.get(position,Path([[0,0],[0,0]],[Path.MOVETO,Path.CLOSEPOLY]))
        return path
    
    def get_Range(self,structure,):
        #2025/06/13 頭から足にかけて+ →　-とポジションの値が変化する
        #つまり、head_zは最大値、tail_zは最小値となる
        z_list=self.contours[structure]["paths"].keys()
        head_z=max(z_list)
        tail_z=min(z_list)
        head_index=self.p2i[head_z]
        tail_index=self.p2i[tail_z]
        return (head_z,tail_z,head_index,tail_index)