// 定数
var that;
var CAN_SIZE = 512;         // CANVASサイズ
var CANVAS_ID = "glcanvas"; // CANVAS_ID

var MODEL_PATH = "assets/haru/";
var MODEL_DEFINE = {
    "type":"Live2D Model Setting",
    "name":"haru",
    "model": MODEL_PATH + "haru.moc",
    "textures":[
        MODEL_PATH + "haru.1024/texture_00.png",
        MODEL_PATH + "haru.1024/texture_01.png",
        MODEL_PATH + "haru.1024/texture_02.png",
    ],
    "motions":[
        MODEL_PATH + "motions/idle_00.mtn",
        MODEL_PATH + "motions/shake_00.mtn",
        MODEL_PATH + "motions/tapBody_03.mtn",
        MODEL_PATH + "motions/tapBody_07.mtn",
    ]
};

// JavaScriptで発生したエラーを取得
window.onerror = function(msg, url, line, col, error) {
    var errmsg = "file:" + url + "<br>line:" + line + " " + msg;
    Simple.myerror(errmsg);
}

window.onload = function(){
    var glCanvas = new Simple();
}

var Simple = function() {
    // コールバック対策
    that = this;
    // Live2Dモデルのインスタンス
    that.live2DModel = null;
    // アニメーションを停止するためのID
    that.requestID = null;
    // モデルのロードが完了したら true
    that.loadLive2DCompleted = false;
    // モデルの初期化が完了したら true
    that.initLive2DCompleted = false;
    // WebGL Image型オブジェクトの配列
    that.loadedImages = [];
    // モーション
    that.motions = [];
    // モーション管理マネジャー
    that.motionMgr = null;
    // モーション番号
    that.motionnm = 0;
    // モーションチェンジ
    that.motionchange = false;
    // Live2D モデル設定。
    that.modelDef = MODEL_DEFINE;
    // ドラッグによるアニメーションの管理
    that.dragMgr = null;        /*new L2DTargetPoint();*/
    that.viewMatrix = null;     /*new L2DViewMatrix();*/
    that.projMatrix = null;     /*new L2DMatrix44()*/
    that.deviceToScreen = null; /*new L2DMatrix44();*/
    that.drag = false;          // ドラッグ中かどうか
    that.lastMouseX = 0;
    that.lastMouseY = 0;
    that.dragX      = 0;
    that.dragY      = 0;

    // Live2Dの初期化
    Live2D.init();

    // canvasオブジェクトを取得
    that.canvas = document.getElementById(CANVAS_ID);
    that.canvas.height = that.canvas.width = CAN_SIZE;
    // モーションボタン
    that.motionbtn = document.getElementById("motionbtn");
    that.motionbtn.addEventListener("click", function(e){
        that.motionchange = true;
        if(that.motions.length - 1  > that.motionnm){
            that.motionnm++;
        }else{
            that.motionnm = 0;
        }
    }, false);
    // コンテキストを失ったとき
    that.canvas.addEventListener("webglcontextlost", function(e) {
        that.myerror("context lost");
        loadLive2DCompleted = false;
        initLive2DCompleted = false;

        var cancelAnimationFrame =
            window.cancelAnimationFrame ||
            window.mozCancelAnimationFrame;
        cancelAnimationFrame(requestID); //アニメーションを停止

        e.preventDefault();
    }, false);

    // コンテキストが復元されたとき
    that.canvas.addEventListener("webglcontextrestored" , function(e){
        that.myerror("webglcontext restored");
        that.initLoop(canvas);
    }, false);

    // マウスドラッグのイベントリスナー
    that.canvas.addEventListener("mousedown", that.mouseEvent, false);
    that.canvas.addEventListener("mousemove", that.mouseEvent, false);
    that.canvas.addEventListener("mouseup", that.mouseEvent, false);
    that.canvas.addEventListener("mouseout", that.mouseEvent, false);

    // 3Dバッファの初期化
    var width = that.canvas.width;
    var height = that.canvas.height;
    // ビュー行列
    var ratio = height / width;
    var left = -1.0;
    var right = 1.0;
    var bottom = -ratio;
    var top = ratio;

    // ドラッグ用のクラス
    that.dragMgr = new L2DTargetPoint();
    // Live2DのView座標クラス
    that.viewMatrix = new L2DViewMatrix();

    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    that.viewMatrix.setScreenRect(left, right, bottom, top);
    // デバイスに対応する画面の範囲。 Xの左端, Xの右端, Yの下端, Yの上端
    that.viewMatrix.setMaxScreenRect(-2.0, 2.0, -2.0, 2.0);
    that.viewMatrix.setMaxScale(2.0);
    that.viewMatrix.setMinScale(0.8);

    // Live2Dの座標系クラス
    that.projMatrix = new L2DMatrix44();
    that.projMatrix.multScale(1, (width / height));

    // マウス用スクリーン変換行列
    that.deviceToScreen = new L2DMatrix44();
    that.deviceToScreen.multTranslate(-width / 2.0, -height / 2.0);
    that.deviceToScreen.multScale(2 / width, -2 / width);

    // Init and start Loop
    that.initLoop(that.canvas);
};


/*
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
    var gl = that.getWebGLContext(canvas, para);
    if (!gl) {
        that.myerror("Failed to create WebGL context.");
        return;
    }

    // 描画エリアを白でクリア
    gl.clearColor( 0.0 , 0.0 , 0.0 , 0.0 );

    //------------ Live2Dの初期化 ------------
    // mocファイルからLive2Dモデルのインスタンスを生成
    that.loadBytes(that.modelDef.model, function(buf){
        that.live2DModel = Live2DModelWebGL.loadModel(buf);
    });

    // テクスチャの読み込み
    var loadCount = 0;
    for(var i = 0; i < that.modelDef.textures.length; i++){
            (function ( tno ){// 即時関数で i の値を tno に固定する（onerror用)
                that.loadedImages[tno] = new Image();
                that.loadedImages[tno].src = that.modelDef.textures[tno];
                that.loadedImages[tno].onload = function(){
                    if((++loadCount) == that.modelDef.textures.length) {
                        that.loadLive2DCompleted = true;//全て読み終わった
                    }
                }
                that.loadedImages[tno].onerror = function() {
                    that.myerror("Failed to load image : " + that.modelDef.textures[tno]);
                }
            })( i );
    }

        // モーションのロード
        for(var i = 0; i < that.modelDef.motions.length; i++){
            that.loadBytes(that.modelDef.motions[i], function(buf){
                that.motions.push(Live2DMotion.loadMotion(buf));
            });
        }
        // モーションマネジャーのインスタンス化
       that.motionMgr = new L2DMotionManager();


    //------------ 描画ループ ------------
    (function tick() {
        that.draw(gl, that); // 1回分描画

        var requestAnimationFrame =
            window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame;
            requestID = requestAnimationFrame( tick , that.canvas );// 一定時間後に自身を呼び出す
    })();
};


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
        var s = 2.0 / that.live2DModel.getCanvasWidth(); //canvasの横幅を-1..1区間に収める
        var matrix4x4 = [
             s, 0, 0, 0,
             0,-s, 0, 0,
             0, 0, 1, 0,
            -1, 1, 0, 1
        ];
        that.live2DModel.setMatrix(matrix4x4);
    }

    // モーションが終了していたら再生する
    if(that.motionMgr.isFinished() || that.motionchange == true ){
        that.motionMgr.startMotion(that.motions[that.motionnm], 0);
        that.motionchange = false;
        console.info("motion:" + that.motionnm);
    }
    // モーション指定されていない場合は何も再生しない
    if(that.motionnm != null){
        // モーションパラメータの更新
        that.motionMgr.updateParam(that.live2DModel);
    }

    // ドラッグ用パラメータの更新
    that.dragMgr.update();
    that.dragX = that.dragMgr.getX();
    that.dragY = that.dragMgr.getY();

    that.live2DModel.setParamFloat("PARAM_ANGLE_X", that.dragX * 30);       // -30から30の値を加える
    that.live2DModel.setParamFloat("PARAM_ANGLE_Y", that.dragY * 30);
    // ドラッグによる体の向きの調整
    that.live2DModel.setParamFloat("PARAM_BODY_ANGLE_X", that.dragX*10);    // -10から10の値を加える
    // ドラッグによる目の向きの調整
    that.live2DModel.setParamFloat("PARAM_EYE_BALL_X", that.dragX);         // -1から1の値を加える
    that.live2DModel.setParamFloat("PARAM_EYE_BALL_Y", that.dragY);
    // キャラクターのパラメータを適当に更新
    var t = UtSystem.getTimeMSec() * 0.001 * 2 * Math.PI; //1秒ごとに2π(1周期)増える
    var cycle = 3.0; //パラメータが一周する時間(秒)
    // 呼吸する
    that.live2DModel.setParamFloat("PARAM_BREATH", 0.5 + 0.5 * Math.sin(t/cycle));


    // Live2Dモデルを更新して描画
    that.live2DModel.update(); // 現在のパラメータに合わせて頂点等を計算
    that.live2DModel.draw();    // 描画
};


/*
* WebGLのコンテキストを取得する
*/
Simple.prototype.getWebGLContext = function(canvas/*HTML5 canvasオブジェクト*/)
{
    var NAMES = [ "webgl" , "experimental-webgl" , "webkit-3d" , "moz-webgl"];

    var param = {
        alpha : true,
        premultipliedAlpha : true
    };

    for( var i = 0; i < NAMES.length; i++ ){
            try{
                var ctx = canvas.getContext( NAMES[i], param );
                if( ctx ) return ctx;
            }
            catch(e){}
    }
    return null;
};


/*
* Image型オブジェクトからテクスチャを生成
*/
Simple.prototype.createTexture = function(gl/*WebGLコンテキスト*/, image/*WebGL Image*/)
{
    var texture = gl.createTexture(); //テクスチャオブジェクトを作成する
    if ( !texture ){
    mylog("Failed to generate gl texture name.");
        return -1;
    }

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);  //imageを上下反転
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D , texture );
    gl.texImage2D( gl.TEXTURE_2D , 0 , gl.RGBA , gl.RGBA , gl.UNSIGNED_BYTE , image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);

    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture( gl.TEXTURE_2D , null );

    return texture;
};


/*
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
            Simple.myerror( "Failed to load (" + request.status + ") : " + path );
            break;
        }
    }
    request.send(null);
};


/*
* 画面ログを出力
*/
Simple.prototype.mylog = function(msg/*string*/)
{
    var myconsole = document.getElementById("myconsole");
    myconsole.innerHTML = myconsole.innerHTML + "<br>" + msg;
    console.log(msg);
};

/*
* 画面エラーを出力
*/
Simple.prototype.myerror = function(msg/*string*/)
{
    console.error(msg);
    that.mylog( "<span style='color:red'>" + msg + "</span>");
};

/*
 * マウスイベント
 */
Simple.prototype.mouseEvent = function(e)
{
    e.preventDefault();
    // マウスダウン時
    if (e.type == "mousedown") {
        // 左クリック以外なら処理を抜ける
        if("button" in e && e.button != 0) return;
        that.modelTurnHead(e);

    // マウス移動時
    } else if (e.type == "mousemove") {
        that.followPointer(e);

    // マウスアップ時
    } else if (e.type == "mouseup") {
        // 左クリック以外なら処理を抜ける
        if("button" in e && e.button != 0) return;
        if (that.drag){
            that.drag = false;
        }
        that.dragMgr.setPoint(0, 0);

    // CANVAS外にマウスがいった時
    } else if (e.type == "mouseout") {
        if (that.drag)
        {
            that.drag = false;
        }
        that.dragMgr.setPoint(0, 0);
    }
};

/*
 * クリックされた方向を向く
 * タップされた場所に応じてモーションを再生
 */
Simple.prototype.modelTurnHead = function(e)
{
    that.drag = true;
    var rect = e.target.getBoundingClientRect();

    var sx = that.transformScreenX(e.clientX - rect.left);
    var sy = that.transformScreenY(e.clientY - rect.top);
    var vx = that.transformViewX(e.clientX - rect.left);
    var vy = that.transformViewY(e.clientY - rect.top);

    that.lastMouseX = sx;
    that.lastMouseY = sy;
    that.dragMgr.setPoint(vx, vy); // その方向を向く
};

/*
 * マウスを動かした時のイベント
 */
Simple.prototype.followPointer = function(e)
{
    var rect = e.target.getBoundingClientRect();

    var sx = that.transformScreenX(e.clientX - rect.left);
    var sy = that.transformScreenY(e.clientY - rect.top);
    var vx = that.transformViewX(e.clientX - rect.left);
    var vy = that.transformViewY(e.clientY - rect.top);

    if (that.drag)
    {
        that.lastMouseX = sx;
        that.lastMouseY = sy;
        that.dragMgr.setPoint(vx, vy); // その方向を向く
    }
};


Simple.prototype.transformViewX = function(deviceX)
{
    var screenX = that.deviceToScreen.transformX(deviceX);  // 論理座標変換した座標を取得。
    return that.viewMatrix.invertTransformX(screenX);       // 拡大、縮小、移動後の値。
};

Simple.prototype.transformViewY = function(deviceY)
{
    var screenY = that.deviceToScreen.transformY(deviceY);  // 論理座標変換した座標を取得。
    return that.viewMatrix.invertTransformY(screenY);       // 拡大、縮小、移動後の値。
};

Simple.prototype.transformScreenX = function(deviceX)
{
    return that.deviceToScreen.transformX(deviceX);
};

Simple.prototype.transformScreenY = function(deviceY)
{
    return that.deviceToScreen.transformY(deviceY);
};