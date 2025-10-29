import { initializeFirebase, signInAnonymouslyAuth } from './firebase.js';
import { GameManager } from './core/GameManager.js';
import { UIManager } from './core/UIManager.js';
import { GameObjectManager } from './core/GameObjectManager.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { InventoryManager } from './core/InventoryManager.js';

const YOUR_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKQa3ju6oFMSCSL5TwGDfqFthaLe3ZImQ",
  authDomain: "escape-game-f1da6.firebaseapp.com",
  projectId: "escape-game-f1da6",
  storageBucket: "escape-game-f1da6.firebasestorage.app",
  messagingSenderId: "553585854269",
  appId: "1:553585854269:web:3fe9b7fe0ced3845502754",
  measurementId: "G-PVDS827R4B"
};

const appId = YOUR_FIREBASE_CONFIG.projectId || 'escape-game-default';

let db = null;
let currentUserId = null;

async function AppInit() {
    const domElements = {
        titleScreen: document.getElementById('title-screen'),
        gameContainer: document.getElementById('game-container'),
        statusMessage: document.getElementById('status-message'),
        userIdDisplay: document.getElementById('user-id-display'),
        continueButton: document.getElementById('continue-button'),
        escapeDoor: document.getElementById('escape-door-btn'),
        keyButton: document.getElementById('key-button'),
        modalOverlay: document.getElementById('modal-overlay'),
        modalTitle: document.getElementById('modal-title'),
        modalText: document.getElementById('modal-text'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        views: {
            front: document.getElementById('front-view'),
            left: document.getElementById('left-view'),
            right: document.getElementById('right-view'),
        }
    };

    const uiManager = new UIManager(domElements);
    const inventoryManager = new InventoryManager(uiManager);

    // Game objects manager: allows placing clickable images on views
    const gameObjectManager = new GameObjectManager(domElements.views, uiManager, inventoryManager);

    // getDocRef closed over db/currentUserId
    const getDocRef = () => {
        if (!db || !currentUserId) return null;
        return doc(db, `/artifacts/${appId}/users/${currentUserId}/escape_game_state`, 'game_state');
    };

    const gameManager = new GameManager(uiManager, getDocRef, inventoryManager, gameObjectManager);
    // 双方向参照をセット: 各マネージャーから gameManager を参照できるようにする
    try {
        gameObjectManager.gameManager = gameManager;
        // Inventory 側からも保存等を呼べるように
        inventoryManager.gameManager = gameManager;
    } catch (e) {
        console.warn('gameManager を gameObjectManager にセットできませんでした:', e);
    }

    if (!YOUR_FIREBASE_CONFIG || !YOUR_FIREBASE_CONFIG.apiKey) {
        uiManager.updateStatus("Firebaseの設定情報が見つかりません。コードを確認してください。", true);
        return;
    }

    try {
        const { app, db: _db, auth } = initializeFirebase(YOUR_FIREBASE_CONFIG);
        db = _db;

        currentUserId = await signInAnonymouslyAuth(auth);
        domElements.userIdDisplay.textContent = currentUserId;

        const ref = getDocRef();
        if (ref) {
            onSnapshot(ref, (snapshot) => gameManager.handleSnapshot(snapshot), (error) => console.error('Firestoreリスナーエラー:', error));
        }
    } catch (error) {
        console.error('Firebaseの初期化または認証に失敗しました:', error);
        uiManager.updateStatus('致命的なエラー: Firebaseに接続できませんでした。', true);
    }

    domElements.modalCloseBtn.addEventListener('click', () => uiManager.hideEscapeMessage());

    // puzzle modal close wiring
    const puzzleCloseBtn = document.getElementById('puzzle-modal-close-btn');
    if (puzzleCloseBtn) puzzleCloseBtn.addEventListener('click', () => uiManager.hidePuzzle());

    document.getElementById('new-game-button').addEventListener('click', () => gameManager.startNewGame());
    domElements.continueButton.addEventListener('click', () => gameManager.continueGame());

    function triggerRightSunlightAnimationIfNeeded() {
        try {
            if (gameManager.rightRoomState === 'sun' && !gameManager.rightSunlightReflected) {
                // オーバーレイがなければ追加
                if (!gameObjectManager.objects.has('sunlight-to-daiza')) {
                    gameObjectManager.addObject({ id: 'sunlight-to-daiza', view: 'right', x: 85, y: 20, width: 360, height: 10,
                        imgSrc: './images/nazo.png', description: '太陽光が台座に差し込んでいる。', isCollectible: false, maxUsageCount: Infinity });
                }
                // 右画面に来たタイミングで必ずアニメを走らせる（再生成せずスタイルだけ掛け直す）
                if (window.styleSunBeam) window.styleSunBeam('sunlight-to-daiza', null, 'sun', true);
            } else if (gameManager.rightSunlightReflected) {
                // 反射済みなら両ビームを常時維持、右入室時に見た目適用
                if (!gameObjectManager.objects.has('sun-reflect-beam')) {
                    gameObjectManager.addObject({ id: 'sun-reflect-beam', view: 'right', x: 40, y: 45, width: 180, height: 10,
                        imgSrc: './images/nazo.png', description: '反射した光が氷壁に当たっている。', isCollectible: false, maxUsageCount: Infinity });
                }
                if (window.styleSunBeam) window.styleSunBeam('sun-reflect-beam', null, 'reflect', false);
                if (gameManager.rightRoomState === 'sun') {
                    if (!gameObjectManager.objects.has('sunlight-to-daiza')) {
                        gameObjectManager.addObject({ id: 'sunlight-to-daiza', view: 'right', x: 85, y: 20, width: 360, height: 10,
                            imgSrc: './images/nazo.png', description: '太陽光が台座に差し込んでいる。', isCollectible: false, maxUsageCount: Infinity });
                    }
                    if (window.styleSunBeam) window.styleSunBeam('sunlight-to-daiza', null, 'sun', false);
                } else {
                    // 右が太陽以外なら元ビームは非表示（仕様に応じて変更可）
                    gameObjectManager.removeObject('sunlight-to-daiza');
                }
            }
        } catch (e) { console.error('triggerRightSunlightAnimationIfNeeded error', e); }
    }

    document.getElementById('left-arrow').addEventListener('click', () => uiManager.changeView('left'));
    document.getElementById('right-arrow').addEventListener('click', () => { uiManager.changeView('right'); triggerRightSunlightAnimationIfNeeded(); });
    // リサイズ時もビームを再計算（右ビュー表示中のみ）
    window.addEventListener('resize', () => {
        if (uiManager && uiManager.currentView === 'right') {
            try { triggerRightSunlightAnimationIfNeeded(); } catch {}
        }
    });
    // domElements.keyButton（鍵ボタン）は削除されたのでイベントリスナも不要
    // 脱出ドアボタンのクリックで unlockDoor を呼ぶ（mysterious-box選択時のみロック解除）
    domElements.escapeDoor.addEventListener('click', () => gameManager.unlockDoor());

    uiManager.showScreen('title');

    // 初期オブジェクトを登録する関数
    function registerInitialObjects() {
        // 下に行くほど最上面に表示される

    // ビーム（太陽光/反射）オーバーレイのスタイル適用ヘルパー
    function styleSunBeam(id, _angleIgnored, theme = 'sun', animate = true) {
            // theme: 'sun' = 入射（右上→台座中心） / 'reflect' = 反射（台座中心→氷壁中心）
            const entry = gameObjectManager.objects.get(id);
            if (!entry) return;

            const container = entry.container;
            // 表示層設定と既存要素の整理
            container.style.zIndex = '50';
            container.style.pointerEvents = 'none';
            const img = container.querySelector('img');
            if (img) img.style.display = 'none';
            Array.from(container.children).forEach(ch => { if (ch.dataset && ch.dataset.beam === '1') ch.remove(); });

            // 参照要素を取得
            const rightView = container.parentElement; // このビームは right に配置されている前提
            if (!rightView) return;

            const daizaEntry = gameObjectManager.objects.get('daiza');
            const iceEntry = gameObjectManager.objects.get('ice-wall');
            if (!daizaEntry) return; // 台座は必須

            const viewRect = rightView.getBoundingClientRect();
            const daizaRect = daizaEntry.container.getBoundingClientRect();
            const daizaCenter = { x: daizaRect.left + daizaRect.width / 2 - viewRect.left, y: daizaRect.top + daizaRect.height / 2 - viewRect.top };

            // from/to を決定
            let from = null, to = null;
            if (theme === 'sun') {
                // 右上から入射して台座中心へ（対角に降りてくる見た目）。少し内側からにしておく。
                from = { x: viewRect.width - 8, y: Math.max(8, viewRect.height * 0.1) };
                to = daizaCenter;
            } else {
                // 反射: 台座中心 → 氷壁中心
                if (!iceEntry) return;
                const iceRect = iceEntry.container.getBoundingClientRect();
                const iceCenter = { x: iceRect.left + iceRect.width / 2 - viewRect.left, y: iceRect.top + iceRect.height / 2 - viewRect.top };
                from = daizaCenter;
                to = iceCenter;
            }

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

            // コンテナを『from』の位置・長さ・角度に合わせて再レイアウト
            container.style.left = `${from.x}px`;
            container.style.top = `${from.y}px`;
            container.style.width = `${dist}px`;
            const thickness = 10; // px
            container.style.height = `${thickness}px`;
            container.style.transformOrigin = '0% 50%'; // 左端・中央
            container.style.transform = `translate(0, -50%) rotate(${angleDeg}deg)`;

            // ビーム本体（横方向に伸びる）
            const line = document.createElement('div');
            line.style.position = 'absolute';
            line.style.left = '0';
            line.style.top = '50%';
            line.style.height = '100%';
            line.style.width = '0';
            line.style.transform = 'translateY(-50%)';
            line.style.borderRadius = '9999px';
            line.style.opacity = '0.95';

            if (theme === 'sun') {
                line.style.background = 'linear-gradient(90deg, rgba(255,243,133,0.0) 0%, rgba(255,243,133,0.8) 30%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,0.2) 100%)';
                line.style.boxShadow = '0 0 12px rgba(255,240,150,0.9), 0 0 24px rgba(255,240,150,0.6)';
            } else {
                line.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.85) 40%, rgba(255,255,255,0.6) 100%)';
                line.style.boxShadow = '0 0 10px rgba(255,255,255,0.9), 0 0 18px rgba(200,220,255,0.6)';
            }

            line.dataset.beam = '1';
            container.appendChild(line);

            if (animate) {
                requestAnimationFrame(() => {
                    line.style.transition = 'width 700ms ease-out';
                    line.style.width = '100%';
                });
            } else {
                line.style.width = '100%';
            }
    }
    // グローバル公開して他のイベントからも呼べるようにする
    try { window.styleSunBeam = styleSunBeam; } catch {}

        // --- オブジェクト(front) ---

        

        // シール配置パズル
        if (!gameObjectManager.objects.has('seal-puzzle')) {
            gameObjectManager.addObject({
                id: 'seal-puzzle',
                view: 'front',
                x: 50,
                y: 80,
                width: 120,
                height: 120,
                imgSrc: './images/seal-puzzle.PNG',
                description: '2つの四角が描かれた謎の装置。シールを配置できそうだ。',
                isPuzzle: true,
                maxUsageCount: Infinity, // 何度でも使用可能
                puzzleContent: `
                    <div class="p-4">
                        <h3 class="text-xl font-bold mb-4">シール配置パズル</h3>
                        <p class="text-gray-600 mb-4">太陽シールと月シールを配置してください</p>
                        
                        <!-- 配置エリア -->
                        <div class="flex justify-center gap-8 mb-6">
                            <div class="slot-area text-center">
                                <p class="text-sm text-gray-500 mb-2">左の四角</p>
                                <div id="left-slot" class="w-24 h-24 border-4 border-gray-400 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 transition bg-gray-100" data-slot="left">
                                    <span class="text-4xl" id="left-seal-display">-</span>
                                </div>
                            </div>
                            <div class="slot-area text-center">
                                <p class="text-sm text-gray-500 mb-2">右の四角</p>
                                <div id="right-slot" class="w-24 h-24 border-4 border-gray-400 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 transition bg-gray-100" data-slot="right">
                                    <span class="text-4xl" id="right-seal-display">🌙</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- シール選択 -->
                        <div class="mb-4">
                            <p class="text-sm font-bold mb-2">配置するシール:</p>
                            <div id="seal-selection" class="flex justify-center gap-4">
                                <!-- 太陽シールは所持時のみ表示（JavaScriptで動的に追加） -->
                                <button id="select-moon" class="w-16 h-16 bg-blue-400 text-4xl rounded-lg hover:bg-blue-500 active:scale-95 transition border-2 border-transparent" data-seal="moon">🌙</button>
                                <button id="remove-seal" class="w-16 h-16 bg-gray-400 text-2xl rounded-lg hover:bg-gray-500 active:scale-95 transition" data-seal="">✕</button>
                            </div>
                        </div>
                        
                        <!-- 状態表示 -->
                        <div class="bg-gray-100 p-3 rounded-lg text-sm">
                            <p><strong>左部屋:</strong> <span id="left-room-status">未設定</span></p>
                            <p><strong>右部屋:</strong> <span id="right-room-status">未設定</span></p>
                        </div>
                    </div>
                `,
                puzzleOptions: {
                    onShow: () => {
                        // 初期状態の復元
                        const rightDisplay = document.getElementById('right-seal-display');
                        const leftDisplay = document.getElementById('left-seal-display');
                        
                        // 初期状態: 右に月シール
                        if (rightDisplay) rightDisplay.textContent = '🌙';
                        if (leftDisplay) leftDisplay.textContent = '-';
                        
                        let selectedSeal = '';
                        let currentLeftSeal = null;
                        let currentRightSeal = 'moon'; // 初期状態
                        
                        // 太陽シール所持チェック & 動的にボタンを追加
                        const sealSelection = document.getElementById('seal-selection');
                        const hasSunSeal = inventoryManager.hasItem('taiyou-si-ru');
                        
                        if (hasSunSeal && sealSelection) {
                            // 太陽シールボタンを月シールの前に挿入
                            const sunButton = document.createElement('button');
                            sunButton.id = 'select-sun';
                            sunButton.className = 'w-16 h-16 bg-yellow-400 text-4xl rounded-lg hover:bg-yellow-500 active:scale-95 transition border-2 border-transparent';
                            sunButton.setAttribute('data-seal', 'sun');
                            sunButton.textContent = '☀️';
                            
                            const moonButton = document.getElementById('select-moon');
                            if (moonButton) {
                                sealSelection.insertBefore(sunButton, moonButton);
                            }
                        }
                        
                        // シール選択ボタン
                        const sealButtons = document.querySelectorAll('[data-seal]');
                        sealButtons.forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectedSeal = btn.getAttribute('data-seal');
                                
                                // 選択状態の表示
                                sealButtons.forEach(b => b.classList.remove('ring-4', 'ring-blue-500'));
                                if (selectedSeal) {
                                    btn.classList.add('ring-4', 'ring-blue-500');
                                }
                            });
                        });
                        
                        // スロットクリック処理
                        const leftSlot = document.getElementById('left-slot');
                        const rightSlot = document.getElementById('right-slot');
                        
                        const updateRoomStates = () => {
                            // 左=太陽 かつ 右=月 → right部屋=moon, left部屋=sun
                            // 左=月 かつ 右=太陽 → right部屋=sun, left部屋=moon
                            if (currentLeftSeal === 'sun' && currentRightSeal === 'moon') {
                                gameManager.rightRoomState = 'moon';
                                gameManager.leftRoomState = 'sun';
                            } else if (currentLeftSeal === 'moon' && currentRightSeal === 'sun') {
                                gameManager.rightRoomState = 'sun';
                                gameManager.leftRoomState = 'moon';
                            } else {
                                // 不完全な状態はリセット
                                if (!currentLeftSeal || !currentRightSeal) {
                                    gameManager.rightRoomState = null;
                                    gameManager.leftRoomState = null;
                                }
                            }
                            
                            // 左部屋のおじさんを状態に応じて更新
                            if (gameManager && typeof gameManager.updateLeftRoomOzisan === 'function') {
                                gameManager.updateLeftRoomOzisan();
                            }
                            
                            // 状態表示を更新
                            const leftStatus = document.getElementById('left-room-status');
                            const rightStatus = document.getElementById('right-room-status');
                            if (leftStatus) {
                                leftStatus.textContent = gameManager.leftRoomState === 'sun' ? '☀️ 太陽' : 
                                                         gameManager.leftRoomState === 'moon' ? '🌙 月' : '未設定';
                            }
                            if (rightStatus) {
                                rightStatus.textContent = gameManager.rightRoomState === 'sun' ? '☀️ 太陽' : 
                                                          gameManager.rightRoomState === 'moon' ? '🌙 月' : '未設定';
                            }

                            // 右のサンライト演出を更新
                            if (gameObjectManager) {
                                if (gameManager.rightRoomState === 'sun' && !gameManager.rightSunlightReflected) {
                                    if (!gameObjectManager.objects.has('sunlight-to-daiza')) {
                                        gameObjectManager.addObject({
                                            id: 'sunlight-to-daiza', view: 'right', x: 85, y: 20, width: 360, height: 10,
                                            imgSrc: './images/nazo.png', description: '太陽光が台座に差し込んでいる。', isCollectible: false, maxUsageCount: Infinity
                                        });
                                        setTimeout(() => { try { if (window.styleSunBeam) window.styleSunBeam('sunlight-to-daiza', null, 'sun', true); } catch {} }, 0);
                                    }
                                } else {
                                    gameObjectManager.removeObject('sunlight-to-daiza');
                                }
                            }
                            
                            // 保存
                            if (gameManager && typeof gameManager.saveGameState === 'function') {
                                gameManager.saveGameState().catch(e => console.error('save error', e));
                            }
                        };
                        
                        if (leftSlot) {
                            leftSlot.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (selectedSeal === '') {
                                    // 削除
                                    currentLeftSeal = null;
                                    leftDisplay.textContent = '-';
                                } else if (selectedSeal === 'sun') {
                                    // 太陽シール配置時にtaiyou-si-ruを持っているかチェック
                                    if (!inventoryManager.hasItem('taiyou-si-ru')) {
                                        uiManager.updateStatus('太陽シールを持っていません。', true);
                                        return;
                                    }
                                    currentLeftSeal = 'sun';
                                    leftDisplay.textContent = '☀️';
                                } else if (selectedSeal === 'moon') {
                                    currentLeftSeal = 'moon';
                                    leftDisplay.textContent = '🌙';
                                }
                                
                                updateRoomStates();
                            });
                        }
                        
                        if (rightSlot) {
                            rightSlot.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (selectedSeal === '') {
                                    // 削除
                                    currentRightSeal = null;
                                    rightDisplay.textContent = '-';
                                } else if (selectedSeal === 'sun') {
                                    // 太陽シール配置時にtaiyou-si-ruを持っているかチェック
                                    if (!inventoryManager.hasItem('taiyou-si-ru')) {
                                        uiManager.updateStatus('太陽シールを持っていません。', true);
                                        return;
                                    }
                                    currentRightSeal = 'sun';
                                    rightDisplay.textContent = '☀️';
                                } else if (selectedSeal === 'moon') {
                                    currentRightSeal = 'moon';
                                    rightDisplay.textContent = '🌙';
                                }
                                
                                updateRoomStates();
                            });
                        }
                        
                        // 初期状態の反映
                        updateRoomStates();
                    },
                    solveFunc: () => {
                        // 現在の部屋状態を通知する情報ウィンドウを表示
                        const toText = (v) => v === 'sun' ? '☀️ 太陽' : v === 'moon' ? '🌙 月' : '未設定';
                        const leftText = toText(gameManager.leftRoomState);
                        const rightText = toText(gameManager.rightRoomState);
                        const tip = gameManager.rightRoomState === 'sun'
                          ? '右の部屋から熱気を感じる。'
                          : gameManager.leftRoomState === 'moon'
                              ? '左の部屋から冷気を感じる'
                              : '何かが動く音がした．あたりを探索してみよう．';
                        const resultHtml = `
                            <div class="p-4">
                                <h3 class="text-xl font-bold mb-4">配置を反映しました</h3>
                                <div class="mb-3 text-gray-700">
                                  <p><strong>左の部屋:</strong> ${leftText}</p>
                                  <p><strong>右の部屋:</strong> ${rightText}</p>
                                </div>
                                <div class="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800">
                                  ${tip}
                                </div>
                                <p class="mt-3 text-xs text-gray-500">ヒント: 各部屋の状態とシールの配置は対応している</p>
                            </div>
                        `;
                        // 情報表示モーダル（解くボタンは非表示で、閉じるのみ）
                        uiManager.showPuzzle(resultHtml, { showSolveButton: false });
                        return false; // そのままモーダルを表示し続ける
                    },
                    showSolveButton: true // 解くボタンを表示
                }
            });
        }

        // --- パズル用オブジェクトの例 ---
        // 以下は「数字入力」で解くパズルの例です。必要なら有効化して使ってください。
        // 解かれた後の金庫
        if (!gameObjectManager.objects.has('solved-box')) {
            gameObjectManager.addObject({
                id: 'solved-box',
                view: 'front',
                x: 80,
                y: 30,
                width: 120,
                height: 80,
                imgSrc: './images/solved-box.png',
                description: '解かれた後の金庫．中にはもう何もないようだ．',
                isCollectible: false,
                    maxUsageCount: 1,
            });
        }

        if (!gameObjectManager.objects.has('picture')) {
            gameObjectManager.addObject({
                id: 'picture',
                view: 'front',
                x: 80,
                y: 17,
                width: 120,
                height: 90,
                imgSrc: './images/picture.png',
                description: '付き合った日の写真だ．',
                isCollectible: false,
                    maxUsageCount: 1,
            });
        }


        // 金庫オブジェクト(記念日)
        if (!gameObjectManager.objects.has('numeric-safe')) {
            gameObjectManager.addObject({
                id: 'numeric-safe',
                view: 'front',
                x: 80,
                y: 30,
                width: 120,
                height: 80,
                imgSrc: './images/numeric-safe.png',
                description: '古い金庫。ダイヤルで開ける必要がある。',
                isPuzzle: true,
                    maxUsageCount: 1,
                puzzleContent: `
                    <div class="p-4">
                        <h3 class="text-xl font-bold mb-2">金庫のダイヤル</h3>
                        <p>4桁の数字を入力して開けてください。</p>
                        <input id="code" name="code" class="w-full p-2 border rounded mt-2" placeholder="yyyy/mm/dd" />
                    </div>
                `,
                puzzleOptions: {
                    solveFunc: (values) => {
                        // 入力を半角に正規化して比較（全角/半角混在対応）
                        const normalize = (s) => {
                            if (s == null) return '';
                            let t = String(s).trim();
                            // 全角数字を半角へ
                            t = t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
                            // 区切り記号を統一（全角スラッシュや各種ダッシュを処理）
                            t = t
                                .replace(/[／]/g, '/')     // 全角スラッシュ → スラッシュ
                                .replace(/[－ー―−]/g, '-') // 各種ダッシュ → ハイフン
                                .replace(/[\.・]/g, '/'); // ドットや中点 → スラッシュ
                            // 最終的にスラッシュ区切りに統一
                            t = t.replace(/-/g, '/').replace(/\/+/, '/');
                            return t;
                        };
                        return normalize(values.code) === '2022/10/30';
                    },
                    spawnObjects: [
                        {
                            id: 'kottsun', view: 'front', x: 80, y: 30, width: 48, height: 50,
                                imgSrc: './images/kottsun.png', description: 'カワウソのこっつん．お腹がすいているようだ．', isCollectible: true,
                                maxUsageCount: 1
                        },
                        {
                            id: 'paper', view: 'front', x: 70, y: 30, width: 48, height: 48,
                            imgSrc: './images/paper.png',
                            description: '謎の申込用紙．名前を書くと太陽シールがもらえるらしい．(ペンを取得したのち，この画像をタップで記入可能)',
                            isCollectible: true,
                            maxUsageCount: 1
                        }
                    ]
                }
            });
        }
        

        if (!gameObjectManager.objects.has('tansu-tuki') && !gameObjectManager.objects.has('tansu-tuki-opened')) {
            const inv = gameManager.inventoryManager;
            const isOpened = (
                (inv && typeof inv.hasItem === 'function' && inv.hasItem('akuriru-picture')) ||
                (gameManager && gameManager.usedItems && gameManager.usedItems.has('tuki-kagi'))
            );

            const applyOpenedVisual = (objId) => {
                const entry = gameObjectManager.objects.get(objId);
                if (!entry) return;
                try {
                    const badge = document.createElement('div');
                    badge.textContent = '開';
                    badge.style.position = 'absolute';
                    badge.style.top = '6px';
                    badge.style.left = '6px';
                    badge.style.padding = '2px 6px';
                    badge.style.background = 'rgba(255,215,0,0.95)';
                    badge.style.color = '#111';
                    badge.style.fontWeight = 'bold';
                    badge.style.borderRadius = '4px';
                    badge.style.boxShadow = '0 1px 2px rgba(0,0,0,0.25)';
                    badge.style.zIndex = '40';
                    entry.container.appendChild(badge);
                    const img = entry.container.querySelector('img');
                    if (img) img.style.filter = 'brightness(0.85)';
                } catch (e) {
                    console.error('applyOpenedVisual error', e);
                }
            };

            if (isOpened) {
                gameObjectManager.addObject({
                    id: 'tansu-tuki-opened',
                    view: 'front',
                    x: 20,
                    y: 31,
                    width: 120,
                    height: 80,
                    imgSrc: './images/tansu-tuki-opened.png',
                    description: '開いた月のタンス。中身は空だ。',
                    isCollectible: false,
                    maxUsageCount: Infinity,
                    onClick: () => {
                        uiManager.updateStatus('もう中身は空のようだ。');
                        const content = `
                            <div class="p-4">
                                <h3 class="text-xl font-bold mb-4">開いた月のタンス</h3>
                                <img src="./images/tansu-tuki-opened.png" alt="開いた月のタンス" class="w-48 h-48 mx-auto mb-4 rounded">
                                <p class="text-gray-700">中には何も残っていない。</p>
                            </div>
                        `;
                        uiManager.showPuzzle(content);
                    }
                });
                // 見た目変更を適用
                setTimeout(() => applyOpenedVisual('tansu-tuki-opened'), 0);
            } else {
                gameObjectManager.addObject({
                    id: 'tansu-tuki',
                    view: 'front',
                    x: 20,
                    y: 31,
                    width: 120,
                    height: 80,
                    imgSrc: './images/tansu-tuki.png',
                    description: '月の鍵穴のついたタンスだ。',
                    isCollectible: false,
                    maxUsageCount: Infinity,
                    onClick: () => {
                        const inv2 = gameManager.inventoryManager;
                        const selected = inv2 && typeof inv2.getSelectedItem === 'function' ? inv2.getSelectedItem() : null;

                        if (selected && selected.id === 'tuki-kagi') {
                            // 既に取得済みなら鍵を消費せずメッセージのみ
                            if (inv2 && typeof inv2.hasItem === 'function' && inv2.hasItem('akuriru-picture')) {
                                uiManager.updateStatus('もう中身は空のようだ。');
                                return;
                            }

                            uiManager.updateStatus('鍵を使ってタンスを開けた。中からガラスブロックを見つけた。');

                            // 鍵を消費
                            if (typeof inv2.removeItemById === 'function') inv2.removeItemById('tuki-kagi');
                            if (gameManager && gameManager.usedItems) gameManager.usedItems.add('tuki-kagi');
                            if (typeof inv2.clearSelection === 'function') inv2.clearSelection();

                            // アイテム付与
                            const newItem = {
                                id: 'akuriru-picture',
                                imgSrc: './images/akuriru-picture.png',
                                description: '月のタンスから見つけたガラスブロック。とてもピカピカしている'
                            };
                            const ok = typeof inv2.addItem === 'function' ? inv2.addItem(newItem) : false;
                            if (ok) {
                                const idx = inv2.slots.findIndex(it => it && it.id === 'akuriru-picture');
                                if (idx !== -1 && typeof inv2.showItemDescription === 'function') {
                                    setTimeout(() => inv2.showItemDescription(idx), 100);
                                }
                            } else {
                                uiManager.updateStatus('インベントリがいっぱいです。', true);
                            }

                            // 見た目変更: opened に差し替え
                            gameObjectManager.removeObject('tansu-tuki');
                            gameObjectManager.addObject({
                                id: 'tansu-tuki-opened',
                                view: 'front',
                                x: 20,
                                y: 31,
                                width: 120,
                                height: 80,
                                imgSrc: './images/tansu-tuki-opened.png',
                                description: '開いた月のタンス。中身は空だ。',
                                isCollectible: false,
                                maxUsageCount: Infinity,
                                onClick: () => {
                                    uiManager.updateStatus('もう中身は空のようだ。');
                                    const content = `
                                        <div class="p-4">
                                            <h3 class="text-xl font-bold mb-4">開いた月のタンス</h3>
                                            <img src="./images/tansu-tuki-opened.png" alt="開いた月のタンス" class="w-48 h-48 mx-auto mb-4 rounded">
                                            <p class="text-gray-700">中には何も残っていない。</p>
                                        </div>
                                    `;
                                    uiManager.showPuzzle(content);
                                }
                            });
                            setTimeout(() => applyOpenedVisual('tansu-tuki-opened'), 0);

                            // 保存
                            if (gameManager && typeof gameManager.saveGameState === 'function') {
                                gameManager.saveGameState().catch(e => console.error('save error', e));
                            }
                            return;
                        }

                        // 説明ウィンドウ（鍵未選択時）
                        const content = `
                            <div class="p-4">
                                <h3 class="text-xl font-bold mb-4">月のタンス</h3>
                                <img src="./images/tansu-tuki.png" alt="月のタンス" class="w-48 h-48 mx-auto mb-4 rounded">
                                <p class="text-gray-700">月の鍵で開きそうだ。</p>
                            </div>
                        `;
                        uiManager.showPuzzle(content);
                    }
                });
            }
        }

        if (!gameObjectManager.objects.has('tansu-1')) {
            gameObjectManager.addObject({
                id: 'tansu-1',
                view: 'front',
                x: 20,
                y: 20,
                width: 120,
                height: 80,
                imgSrc: './images/tansu-1.png',
                description: 'うんちく1号。水槽越しに文字を見ると反転して見えるらしい。つまり"←"は本来"→"を示しているのだ。水の屈折によるものである．',
                isCollectible: false,
                maxUsageCount: 1,
            });
        }

        if (!gameObjectManager.objects.has('tansu-2')) {
            gameObjectManager.addObject({
                id: 'tansu-2',
                view: 'front',
                x: 20,
                y: 10,
                width: 120,
                height: 80,
                imgSrc: './images/tansu-2.png',
                description: 'うんちく2号。太陽光を集めれば木に火を付けれるらしい。太陽の力は偉大である．氷なんて溶かしてしまうのだ．',
                isCollectible: false,
                maxUsageCount: 1,
            });
        }

        //オブジェクト(left)
        // 左部屋の状態インジケーター
        if (!gameObjectManager.objects.has('left-room-indicator')) {
            gameObjectManager.addObject({
                id: 'left-room-indicator',
                view: 'left',
                x: 80,
                y: 10,
                width: 60,
                height: 60,
                imgSrc: './images/indicator.png',
                description: '左部屋の状態を示すインジケーター',
                isCollectible: false,
                maxUsageCount: Infinity,
                onClick: function() {
                    const state = gameManager.leftRoomState;
                    const stateText = state === 'sun' ? '☀️ 太陽' : state === 'moon' ? '🌙 月' : '未設定';
                    uiManager.updateStatus(`今左の部屋は: ${stateText}ですよ。`);
                }
            });
        }
        
        //箱(水槽の土台)
        if (!gameObjectManager.objects.has('left-object')) {
            gameObjectManager.addObject({
                id: 'left-object',
                view: 'left',
                x: 20,
                y: 41,
                width: 80,
                height: 80,
                imgSrc: './images/left-object.png',
                description: '水槽の土台。頑張って支えてます！ちょっと水槽がめり込んでいるとかいないとか',
                isCollectible: false,
                maxUsageCount: 1,
            });
        }

        //水槽の謎を解くと出現
        if (!gameObjectManager.objects.has('unlockedSuisou')) {
            gameObjectManager.addObject({
                id: 'unlockedSuisou',
                view: 'left',
                x: 20,
                y: 30,
                width: 80,
                height: 80,
                imgSrc: './images/unlockedSuisou.png',
                description: '魚がいなくなって何か見えるようになった．',
                isCollectible: false,
                maxUsageCount: 1,
            });
        }

        //水槽(こっつんを利用すると消滅する)
        if (!gameObjectManager.objects.has('suisou')) {
            gameObjectManager.addObject({
                id: 'suisou',
                view: 'left',
                x: 20,
                y: 30,
                width: 80,
                height: 80,
                imgSrc: './images/suiou.png',
                description: '魚が邪魔をしているようだ．こっつんに食べてもらおう．',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => gameManager.unlockSuisou(),
            });
        }

        //太陽おじさん(記入済みの申込書を使うと太陽シールをくれる) - 左部屋が未設定か太陽の時のみ表示
        if (!gameObjectManager.objects.has('taiyou-ozisan') && 
            (gameManager.leftRoomState === null || gameManager.leftRoomState === 'sun')) {
            gameObjectManager.addObject({
                id: 'taiyou-ozisan',
                view: 'left',
                x: 60,
                y: 30,
                width: 133,
                height: 160,
                imgSrc: './images/taiyou-ozisan.png',
                description: '記入済みの申込書をくれれば，太陽シールをあげよう．何に使うかはわからないがな．',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => gameManager.unlockTaiyouOzisan(),
            });
        }

        //月おじさん(左部屋が月の状態の時に登場)
        if (!gameObjectManager.objects.has('tuki-ozisan') && gameManager.leftRoomState === 'moon') {
            gameObjectManager.addObject({
                id: 'tuki-ozisan',
                view: 'left',
                x: 60,
                y: 30,
                width: 133,
                height: 160,
                imgSrc: './images/tuki-ozisan.png',
                description: 'やぁ、私は月おじさん。最近財布を無くしたんだよ。見かけなかったかい？',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => gameManager.unlockTukiOzisan(),
            });
        }

        //オブジェクト(right)
        // 右部屋の状態インジケーター
        if (!gameObjectManager.objects.has('right-room-indicator')) {
            gameObjectManager.addObject({
                id: 'right-room-indicator',
                view: 'right',
                x: 80,
                y: 10,
                width: 60,
                height: 60,
                imgSrc: './images/indicator.png',
                description: '右部屋の状態を示すインジケーター',
                isCollectible: false,
                maxUsageCount: Infinity,
                onClick: function() {
                    const state = gameManager.rightRoomState;
                    const stateText = state === 'sun' ? '☀️ 太陽' : state === 'moon' ? '🌙 月' : '未設定';
                    uiManager.updateStatus(`今右の部屋は: ${stateText}状態ですよ。`);
                }
            });
        }
        
        // 4桁シンボル謎解き(水槽の謎を利用)
        if (!gameObjectManager.objects.has('right-object')) {
            gameObjectManager.addObject({
                id: 'right-object',
                view: 'right',
                x: 80,
                y: 41,
                width: 90,
                height: 29,
                imgSrc: './images/right-object.png',
                description: 'シンボルが描かれた謎の筆箱。',
                isPuzzle: true,
                maxUsageCount: 1,
                puzzleContent: `
                    <div class="p-4">
                        <h3 class="text-xl font-bold mb-4">シンボルパズル</h3>
                        <p class="text-gray-600 mb-4">各矢印に対応する数字をタップで選択してください</p>
                        <div class="flex justify-center gap-3 mb-6">
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">→</div>
                                <button id="digit-0" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">↓</div>
                                <button id="digit-1" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">↑</div>
                                <button id="digit-2" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">←</div>
                                <button id="digit-3" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                        </div>
                    </div>
                `,
                puzzleOptions: {
                    onShow: () => {
                        // 各桁のボタンにタップで数字をインクリメントする機能を追加
                        for (let i = 0; i < 4; i++) {
                            const btn = document.getElementById(`digit-${i}`);
                            if (btn) {
                                btn.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const current = parseInt(btn.textContent) || 0;
                                    const next = (current + 1) % 10;
                                    btn.textContent = next.toString();
                                });
                            }
                        }
                    },
                    solveFunc: (values) => {
                        // values は未使用（ボタンから直接取得）
                        const digit0 = document.getElementById('digit-0');
                        const digit1 = document.getElementById('digit-1');
                        const digit2 = document.getElementById('digit-2');
                        const digit3 = document.getElementById('digit-3');
                        
                        if (!digit0 || !digit1 || !digit2 || !digit3) return false;
                        
                        const code = digit0.textContent + digit1.textContent + digit2.textContent + digit3.textContent;
                        // 正解は "1219" の例（変更可能）
                        return code === '1219';
                    },
                    spawnObjects: [
                        {
                            id: 'pen',
                            view: 'right',
                            x: 80,
                            y: 41,
                            width: 45,
                            height: 60,
                            imgSrc: './images/pen.png',
                            description: 'シンボルパズルから得たペン。書き心地抜群！',
                            isCollectible: true,
                            maxUsageCount: 1
                        }
                    ]
                }
            });
        }

        if (!gameObjectManager.objects.has('tuki-osaihu') && gameManager.rightRoomState === 'moon') {
            gameObjectManager.addObject({
                id: 'tuki-osaihu',
                view: 'right',
                x: 60,
                y: 30,
                width: 70,
                height: 30,
                imgSrc: './images/tuki-osaihu.png',
                description: '月の模様があるお財布．中に免許証が入っている．名前:月おじさん...',
                isCollectible: true,
                maxUsageCount: 1,
            });
        }

        if (!gameObjectManager.objects.has('daiza')) {
            gameObjectManager.addObject({
                id: 'daiza',
                view: 'right',
                x: 50,
                y: 60,
                width: 70,
                height: 70,
                imgSrc: './images/daiza.png',
                description: '謎の台座．何かはめるのかな？',
                isCollectible: false,
                maxUsageCount: Infinity,
                onClick: () => {
                    const inv = gameManager.inventoryManager;
                    const selected = inv && typeof inv.getSelectedItem === 'function' ? inv.getSelectedItem() : null;
                    
                    if (gameManager.rightRoomState !== 'sun') {
                        uiManager.updateStatus('今は太陽光が差し込んでいない。台座に何も起きない。');
                        return;
                    }
                    if (gameManager.rightSunlightReflected) {
                        uiManager.updateStatus('すでにガラスブロックが設置され，光は反射している。');
                        return;
                    }
                    if (!selected || selected.id !== 'akuriru-picture') {
                        const content = `
                            <div class="p-4">
                                <h3 class="text-xl font-bold mb-4">台座</h3>
                                <img src="./images/daiza.png" alt="台座" class="w-48 h-48 mx-auto mb-4 rounded">
                                <p class="text-gray-700">太陽光が差し込んでいる。ガラスブロックを置けば反射できそうだ。</p>
                            </div>
                        `;
                        uiManager.showPuzzle(content);
                        return;
                    }

                    // ガラスブロックを設置 → 反射発生
                    if (typeof inv.removeItemById === 'function') inv.removeItemById('akuriru-picture');
                    if (gameManager && gameManager.usedItems) gameManager.usedItems.add('akuriru-picture');
                    if (typeof inv.clearSelection === 'function') inv.clearSelection();
                    gameManager.rightSunlightReflected = true;
                    uiManager.updateStatus('ガラスブロックを台座に設置した。太陽光が反射して氷の壁に当たった！');

                    // サンライト演出は残す（残光として画面に保持）

                    // 反射ビーム演出（台座→氷壁）
                    if (!gameObjectManager.objects.has('sun-reflect-beam')) {
                        gameObjectManager.addObject({
                            id: 'sun-reflect-beam', view: 'right',
                            x: 40,  // 台座(50,60) と 氷壁(30,30) の中点近辺
                            y: 45,
                            width: 180,
                            height: 10,
                            imgSrc: './images/nazo.png',
                            description: '反射した光が氷壁に当たっている。',
                            isCollectible: false,
                            maxUsageCount: Infinity,
                        });
                        setTimeout(() => {
                            try {
                                if (window.styleSunBeam) {
                                    window.styleSunBeam('sun-reflect-beam', null, 'reflect', true);
                                    // 念のため入射ビームも再適用（一時的なスタイル崩れ対策）
                                    if (gameObjectManager.objects.has('sunlight-to-daiza')) {
                                        window.styleSunBeam('sunlight-to-daiza', null, 'sun', false);
                                    }
                                }
                            } catch {}
                        }, 0);
                        // 反射ビームは画面に残す（自動で消さない）
                    }

                    // 氷の壁に鍵を出現させる（演出後に少し遅延）
                    setTimeout(() => {
                        if (!gameObjectManager.objects.has('escape-key')) {
                            gameObjectManager.addObject({
                                id: 'escape-key',
                                view: 'right',
                                x: 30,
                                y: 30,
                                width: 48,
                                height: 48,
                                imgSrc: './images/escape-key.png',
                                description: '氷から取り出せるようになった鍵。キンキンに冷えてやがる！',
                                isCollectible: true,
                                maxUsageCount: 1,
                            });
                        }
                    }, 400);

                    // 保存
                    if (gameManager && typeof gameManager.saveGameState === 'function') {
                        gameManager.saveGameState().catch(e => console.error('save error', e));
                    }
                }
            });
        }

        if (!gameObjectManager.objects.has('ice-wall')) {
            gameObjectManager.addObject({
                id: 'ice-wall',
                view: 'right',
                x: 30,
                y: 30,
                width: 200,
                height: 141,
                imgSrc: './images/ice-wall.png',
                description: '巨大な氷の壁．中に鍵のようなものが見える．くそ，ビームを出せれば溶かせるのに！か〇はめ波！',
                isCollectible: false,
                maxUsageCount: Infinity,
            });
        }

        // 右=太陽 かつ まだ反射前ならサンライト演出を追加（右上→台座へ斜めに）
        if (gameManager.rightRoomState === 'sun' && !gameManager.rightSunlightReflected && !gameObjectManager.objects.has('sunlight-to-daiza')) {
            gameObjectManager.addObject({
                id: 'sunlight-to-daiza',
                view: 'right',
                x: 85,
                y: 20,
                width: 600,
                height: 10,
                imgSrc: './images/nazo.png',
                description: '太陽光が台座に差し込んでいる。',
                isCollectible: false,
                maxUsageCount: Infinity
            });
            // 現在のビューが right ならアニメ、そうでなければ静止表示（右に来たら再アニメ）
            const animate = (uiManager && uiManager.currentView === 'right');
            setTimeout(() => { try { if (window.styleSunBeam) window.styleSunBeam('sunlight-to-daiza', null, 'sun', animate); } catch {} }, 0);
        }

    }
    // 初回起動時に初期オブジェクトを登録
    registerInitialObjects();
    // GameManager からも呼べるようにwindowに登録
    window.registerInitialObjects = registerInitialObjects;
}

document.addEventListener('DOMContentLoaded', AppInit);
document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); });
