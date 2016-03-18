/**
*    定数
*/
// モデルパス
var MODEL_PATH = 'assets/haru/';
// モデル定義ファイル
var MODEL_JSON = "haru.model.json";
// canvasの幅と高さ
var CANVAS_SIZE  = 512;
// canvasのID
var CANVAS_ID ='glcanvas';
var glCanvas = null;


// ロード時
window.onload = function(){
    // model.jsonからLive2Dモデル情報取得し生成
    jsonloader(MODEL_PATH + MODEL_JSON);
}

// JavaScriptで発生したエラーを取得
window.onerror = function(msg, url, line, col, error) {
    var errmsg = "file:" + url + " line:" + line + " " + msg;
    console.log(errmsg);
}


/**
* ファイルを配列としてロードする
*/
function jsonloader(filepath){
    var request = new XMLHttpRequest();
    request.open("GET", filepath, true);
    request.onreadystatechange = function(){
        if(request.readyState == 4 && request.status == 200){
            // model.jsonから取得
            var jsondata = JSON.parse(request.responseText);
            // 引数はCanvasID, json, 表示スケール（省略可）
            glCanvas = new Simple(CANVAS_ID, jsondata , 2.0);
            // モーション分の選択ボタンを作る
            make_optionbtn();
        }
    }
    request.send(null);
}


/****************************************
* Simpleを拡張したクラス
****************************************/
var Simple = function(canvasid, json, modelscale) {
    // optional
    if(modelscale == null) modelscale = 2.0;
    // Live2Dモデル管理クラスのインスタンス化
    this.live2DMgr = new LAppLive2DManager();
    // Live2Dモデルのインスタンス
    this.live2DModel = null;
    // アニメーションを停止するためのID
    this.requestID = null;
    // モデルのロードが完了したら true
    this.loadLive2DCompleted = false;
    // モデルの初期化が完了したら true
    this.initLive2DCompleted = false;
    // WebGL Image型オブジェクトの配列
    this.loadedImages = [];
    // モーション
    this.motions = [];
    // モーション管理マネジャー
    this.motionMgr = null;
    // モーション番号
    this.motionnm = 0;
    // モーションフラグ
    this.motionflg = false;
    // サウンド
    this.sounds = [];
    // サウンド番号
    this.soundnm = 0;
    // 前に流したサウンド
    this.beforesound = 0;

    // Live2D モデル設定
    this.modelDef = json;
    // Live2DモデルのOpenGL表示サイズ
    this.modelscale = modelscale;
    // フェードイン
    this.fadeines = [];
    // フェードアウト
    this.fadeoutes = [];
    // ポーズ
    this.pose = null;
    // 物理演算
    this.physics = null;

    // Live2Dの初期化
    Live2D.init();

    // canvasオブジェクトを取得
    this.canvas = document.getElementById(canvasid);
    this.canvas.width = this.canvas.height = CANVAS_SIZE;

    // コンテキストを失ったとき
    this.canvas.addEventListener("webglcontextlost", function(e) {
        console.log("context lost");
        this.loadLive2DCompleted = false;
        this.initLive2DCompleted = false;

        var cancelAnimationFrame =
            window.cancelAnimationFrame ||
            window.mozCancelAnimationFrame;
        cancelAnimationFrame(this.requestID); //アニメーションを停止

        e.preventDefault();
    }, false);

    // コンテキストが復元されたとき
    this.canvas.addEventListener("webglcontextrestored" , function(e){
        console.log("webglcontext restored");
        this.initLoop(this.canvas);
    }, false);

    // Init and start Loop
    this.initLoop(this.canvas);
};


/**
* WebGLコンテキストを取得・初期化。
* Live2Dの初期化、描画ループを開始。
*/
Simple.prototype.initLoop = function(canvas/*HTML5 canvasオブジェクト*/)
{
    //------------ WebGLの初期化 ------------
    // WebGLのコンテキストを取得する
    var para = {
        premultipliedAlpha : true,
//        alpha : false
    };
    // WebGLのコンテキストを取得する
    var gl = this.getWebGLContext(canvas, para);
    if (!gl) {
        console.log("Failed to create WebGL context.");
        return;
    }

    // 描画エリアを白でクリア
    gl.clearColor( 0.0 , 0.0 , 0.0 , 0.0 );

    //------------ Live2Dの初期化 ------------
    // コールバック対策用
    var that = this;
    // mocファイルからLive2Dモデルのインスタンスを生成
    this.loadBytes(MODEL_PATH + that.modelDef.model, function(buf){
        that.live2DModel = Live2DModelWebGL.loadModel(buf);
    });

    // テクスチャの読み込み
    var loadCount = 0;
    for(var i = 0; i < that.modelDef.textures.length; i++){
        (function ( tno ){// 即時関数で i の値を tno に固定する（onerror用)
            that.loadedImages[tno] = new Image();
            that.loadedImages[tno].src = MODEL_PATH + that.modelDef.textures[tno];
            that.loadedImages[tno].onload = function(){
                if((++loadCount) == that.modelDef.textures.length) {
                    that.loadLive2DCompleted = true;//全て読み終わった
                }
            }
            that.loadedImages[tno].onerror = function() {
                console.log("Failed to load image : " + that.modelDef.textures[tno]);
            }
        })( i );
    }

    var motion_keys = [];   // モーションキー配列
    var mtn_tag = 0;        // モーションタグ
    var mtn_num = 0;        // モーションカウント
    // keyを取得
    for(var key in that.modelDef.motions){
        // moitons配下のキーを取得
        motion_keys[mtn_tag] = key;
        // 読み込むモーションファイル数を取得
        mtn_num += that.modelDef.motions[motion_keys[mtn_tag]].length;
        mtn_tag++;
    }

    // モーションタグ分ループ
    for(var mtnkey in motion_keys){
        // モーションとサウンドを読み込む(motions配下のタグを読み込む)
        for(var j = 0; j < that.modelDef.motions[motion_keys[mtnkey]].length; j++){
            // モーションの数だけロード
            that.loadBytes(MODEL_PATH + that.modelDef.motions[motion_keys[mtnkey]][j].file, function(buf){
                that.motions.push(Live2DMotion.loadMotion(buf));
            });
            // サウンドの数だけロード
            if(that.modelDef.motions[motion_keys[mtnkey]][j].sound == null){
                that.sounds.push("");
            }else{
                that.sounds.push(new Sound(MODEL_PATH + that.modelDef.motions[motion_keys[mtnkey]][j].sound));
            }
            // フェードイン
            if(that.modelDef.motions[motion_keys[mtnkey]][j].fade_in == null){
                that.fadeines.push("");
            }else{
                that.fadeines.push(that.modelDef.motions[motion_keys[mtnkey]][j].fade_in);
            }
            // フェードアウト
            if(that.modelDef.motions[motion_keys[mtnkey]][j].fade_out == null){
                that.fadeoutes.push("");
            }else{
                that.fadeoutes.push(that.modelDef.motions[motion_keys[mtnkey]][j].fade_out);
            }
        }
    }

    // モーションマネジャーのインスタンス化
    that.motionMgr = new L2DMotionManager();

    // ポーズのロード(json内のposeがあるかチェック)
    if(that.modelDef.pose !== void 0){
        that.loadBytes(MODEL_PATH + that.modelDef.pose, function(buf){
            // ポースクラスのロード
            that.pose = L2DPose.load(buf);
        });
    }

    // 物理演算のロード(json内のphysicsがあるかチェック)
    if(that.modelDef.physics !== void 0){
        that.loadBytes(MODEL_PATH + that.modelDef.physics, function(buf){
            // 物理演算クラスのロード
            that.physics = L2DPhysics.load(buf);
        });
    }

    //------------ 描画ループ ------------
    (function tick() {
        that.draw(gl, that); // 1回分描画

        var requestAnimationFrame =
            window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame;
        that.requestID = requestAnimationFrame( tick , that.canvas );// 一定時間後に自身を呼び出す
    })();
};


/**
* Live2Dの描画処理
*/
Simple.prototype.draw = function(gl/*WebGLコンテキスト*/, that)
{
    // Canvasをクリアする
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Live2D初期化
    if( ! that.live2DModel || ! that.loadLive2DCompleted )
        return; //ロードが完了していないので何もしないで返る

    // ロード完了後に初回のみ初期化する
    if( ! that.initLive2DCompleted ){
        that.initLive2DCompleted = true;
        // 画像からWebGLテクスチャを生成し、モデルに登録
        for( var i = 0; i < that.loadedImages.length; i++ ){
            //Image型オブジェクトからテクスチャを生成
            var texName = that.createTexture(gl, that.loadedImages[i]);

            that.live2DModel.setTexture(i, texName); //モデルにテクスチャをセット
        }

        // テクスチャの元画像の参照をクリア
        that.loadedImages = null;
        // OpenGLのコンテキストをセット
        that.live2DModel.setGL(gl);
        // 表示位置を指定するための行列を定義する
        var s = that.modelscale / that.live2DModel.getCanvasWidth();
        var matrix4x4 = [
             s, 0, 0, 0,
             0,-s, 0, 0,
             0, 0, 1, 0,
            -that.modelscale/2, that.modelscale/2, 0, 1
        ];
        that.live2DModel.setMatrix(matrix4x4);
    }

    // アイドルモーション以外の場合（フラグと優先度で判定する）
    if(that.motionflg == true && that.motionMgr.getCurrentPriority() == 0){
        // フェードインの設定
        that.motions[that.motionnm].setFadeIn(that.fadeines[that.motionnm]);
        // フェードアウトの設定
        that.motions[that.motionnm].setFadeOut(that.fadeoutes[that.motionnm]);
        // アイドルモーションよりも優先度を高く再生する
        that.motionMgr.startMotion(that.motions[that.motionnm], 1);
        that.motionflg = false;
        // 音声ファイルもあれば再生
        if(that.sounds[that.motionnm]){
            // 前回の音声があれば停止する
            if(that.sounds[that.beforesound] != ""){
                that.sounds[that.beforesound].stop();
            }
            // 音声を再生
            that.sounds[that.motionnm].play();
            // 途中で停止できるように格納する
            that.beforesound = that.motionnm;
        }
    }

    // モーションが終了していたらアイドルモーションの再生
    if(that.motionMgr.isFinished() && that.motionnm != null){
        // フェードインの設定
        that.motions[that.motionnm].setFadeIn(that.fadeines[that.motionnm]);
        // フェードアウトの設定
        that.motions[that.motionnm].setFadeOut(that.fadeoutes[that.motionnm]);
        // 優先度は低めでモーション再生
        that.motionMgr.startMotion(that.motions[that.motionnm], 0);
        // 音声ファイルもあれば再生
        if(that.sounds[that.motionnm]){
            // 前回の音声があれば停止する
            if(that.sounds[that.beforesound] != ""){
                that.sounds[that.beforesound].stop();
            }
            // 音声を再生
            that.sounds[that.motionnm].play();
            // 途中で停止できるように格納する
            that.beforesound = that.motionnm;
        }
    }
    // モーション指定されていない場合は何も再生しない
    if(that.motionnm != null){
        // モーションパラメータの更新
        that.motionMgr.updateParam(that.live2DModel);
    }

    // ポーズパラメータの更新
    if(that.pose != null)that.pose.updateParam(that.live2DModel);

    // 物理演算パラメータの更新
    if(that.physics != null)that.physics.updateParam(that.live2DModel);

    // Live2Dモデルを更新して描画
    that.live2DModel.update();  // 現在のパラメータに合わせて頂点等を計算
    that.live2DModel.draw();    // 描画
};


/**
* WebGLのコンテキストを取得する
*/
Simple.prototype.getWebGLContext = function(canvas/*HTML5 canvasオブジェクト*/, para)
{
    var NAMES = [ "webgl" , "experimental-webgl" , "webkit-3d" , "moz-webgl"];
    for( var i = 0; i < NAMES.length; i++ ){
        try{
            var ctx = canvas.getContext( NAMES[i], para );
            if( ctx ) return ctx;
        }
        catch(e){}
    }
    return null;
};


/**
* Image型オブジェクトからテクスチャを生成
*/
Simple.prototype.createTexture = function(gl/*WebGLコンテキスト*/, image/*WebGL Image*/)
{
    var texture = gl.createTexture(); //テクスチャオブジェクトを作成する
    if ( !texture ){
        console.log("Failed to generate gl texture name.");
        return -1;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);    //  追加
    // imageを上下反転
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    // テクスチャのユニットを指定する
    gl.activeTexture( gl.TEXTURE0 );
    // テクスチャをバインドする
    gl.bindTexture( gl.TEXTURE_2D , texture );
    // テクスチャに画像データを紐付ける
    gl.texImage2D( gl.TEXTURE_2D , 0 , gl.RGBA , gl.RGBA , gl.UNSIGNED_BYTE , image);
    // テクスチャの品質を指定する(対象ピクセルの中心に最も近い点の値)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // ミップマップの品質を指定する
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    // ミップマップの生成
    gl.generateMipmap(gl.TEXTURE_2D);
    // テクスチャのバインド開放
    gl.bindTexture( gl.TEXTURE_2D , null );

    return texture;
};

/**
* ファイルをバイト配列としてロードする
*/
Simple.prototype.loadBytes = function(path , callback)
{
    var request = new XMLHttpRequest();
    request.open("GET", path , true);
    request.responseType = "arraybuffer";
    request.onload = function(){
        switch( request.status ){
        case 200:
            callback( request.response );
            break;
        default:
            console.log( "Failed to load (" + request.status + ") : " + path );
            break;
        }
    }
    request.send(null);
};


/****************************************
* サウンドクラス
****************************************/
var Sound = function(path   /*音声ファイルパス*/) {
    this.snd = document.createElement("audio");
    this.snd.src = path;
};

/**
* 音声再生
*/
Sound.prototype.play = function() {
    this.snd.play();
};

/**
* 音声停止
*/
Sound.prototype.stop = function() {
    this.snd.pause();
    this.snd.currentTime = 0;
};


/****************************************
* ボタンイベント処理
****************************************/
// モーションファイル名取得
var mtnfilenames = [];
// モーションボタン作る場所
var selectmenu = document.getElementById('selectmenu');

// モーション分の選択ボタンを作る
function make_optionbtn(){
    // モーションファイル名を取得する
    if(glCanvas != null && mtnfilenames.length == 0){
        for(var key in glCanvas.modelDef.motions){
            console.log(key);
            for(j = 0; j < glCanvas.modelDef.motions[key].length; j++){
                // 余分なパスをカット
                var strfilenm = glCanvas.modelDef.motions[key][j].file.split("/");
                // 読み込むモーションファイル名を取得
                mtnfilenames.push(strfilenm[1]);
                // オプションボタンを追加
                var option = document.createElement('option');
                option.value = strfilenm[1];
                option.appendChild(document.createTextNode(strfilenm[1]));
                selectmenu.appendChild(option);
            }
        }
    }
}


// モーション切り替え
function motionChange(){
    // 選択ボタンの値を取得
    var mtnfilenm = selectmenu.value;

    var cnt = 0;
    // ファイル名からファイル番号を取り出す
    for(var k = 0; k < mtnfilenames.length; k++){
        if(mtnfilenm == mtnfilenames[k]){
            break;
        }
        cnt++;
    }
    // Live2Dモデルに渡す
    glCanvas.motionnm = cnt;
    glCanvas.motionflg = true;
}