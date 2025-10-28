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

    document.getElementById('left-arrow').addEventListener('click', () => uiManager.changeView('left'));
    document.getElementById('right-arrow').addEventListener('click', () => uiManager.changeView('right'));
    // domElements.keyButton（鍵ボタン）は削除されたのでイベントリスナも不要
    // 脱出ドアボタンのクリックで unlockDoor を呼ぶ（mysterious-box選択時のみロック解除）
    domElements.escapeDoor.addEventListener('click', () => gameManager.unlockDoor());

    uiManager.showScreen('title');

    // 初期オブジェクトを登録する関数
    function registerInitialObjects() {
        // 下に行くほど最上面に表示される

        // --- オブジェクト(front) ---

        //脱出用の箱
        if (!gameObjectManager.objects.has('mysterious-box')) {
            gameObjectManager.addObject({
                id: 'mysterious-box',
                view: 'front',
                x: 60,
                y: 55,
                width: 96,
                height: 96,
                imgSrc: './images/nazo.png',
                description: '不思議な箱です。鍵がかかっているようです。',
                isCollectible: true,
                    maxUsageCount: 1,
            });
        }

        // シール配置パズル
        if (!gameObjectManager.objects.has('seal-puzzle')) {
            gameObjectManager.addObject({
                id: 'seal-puzzle',
                view: 'front',
                x: 30,
                y: 55,
                width: 120,
                height: 80,
                imgSrc: './images/nazo.png',
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
                        // このパズルは「解く」ボタンを表示しない
                        return false;
                    },
                    showSolveButton: false // 解くボタンを非表示
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
                imgSrc: './images/nazo.png',
                description: '解かれた後の金庫．中にはもう何もないようだ．',
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
                imgSrc: './images/nazo.png',
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
                            id: 'kottsun', view: 'front', x: 80, y: 30, width: 48, height: 48,
                                imgSrc: './images/nazo.png', description: 'カワウソのこっつん．お腹がすいているようだ．', isCollectible: true,
                                maxUsageCount: 1
                        },
                        {
                            id: 'paper', view: 'front', x: 70, y: 30, width: 48, height: 48,
                            imgSrc: './images/nazo.png',
                            description: '謎の申込用紙．名前を書くと太陽シールがもらえるらしい．',
                            isCollectible: true,
                            maxUsageCount: 1
                        }
                    ]
                }
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
                imgSrc: './images/nazo.png',
                description: '左部屋の状態を示すインジケーター',
                isCollectible: false,
                maxUsageCount: Infinity,
                onClick: function() {
                    const state = gameManager.leftRoomState;
                    const stateText = state === 'sun' ? '☀️ 太陽' : state === 'moon' ? '🌙 月' : '未設定';
                    uiManager.updateStatus(`左部屋の状態: ${stateText}`);
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
                imgSrc: './images/nazo.png',
                description: '左側の不思議な箱です。',
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
                imgSrc: './images/nazo.png',
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
                imgSrc: './images/nazo.png',
                description: '左側の不思議な箱です。',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => gameManager.unlockSuisou(),
            });
        }

        //太陽おじさん(記入済みの申込書を使うと太陽シールをくれる)
        if (!gameObjectManager.objects.has('taiyou-ozisan')) {
            gameObjectManager.addObject({
                id: 'taiyou-ozisan',
                view: 'left',
                x: 60,
                y: 30,
                width: 160,
                height: 160,
                imgSrc: './images/nazo.png',
                description: '記入済みの申込書をくれれば，太陽シールをあげよう．',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => gameManager.unlockTaiyouOzisan(),
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
                imgSrc: './images/nazo.png',
                description: '右部屋の状態を示すインジケーター',
                isCollectible: false,
                maxUsageCount: Infinity,
                onClick: function() {
                    const state = gameManager.rightRoomState;
                    const stateText = state === 'sun' ? '☀️ 太陽' : state === 'moon' ? '🌙 月' : '未設定';
                    uiManager.updateStatus(`右部屋の状態: ${stateText}`);
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
                width: 80,
                height: 80,
                imgSrc: './images/nazo.png',
                description: 'シンボルが描かれた謎の装置。',
                isPuzzle: true,
                maxUsageCount: 1,
                puzzleContent: `
                    <div class="p-4">
                        <h3 class="text-xl font-bold mb-4">シンボルパズル</h3>
                        <p class="text-gray-600 mb-4">各シンボルに対応する数字をタップで選択してください</p>
                        <div class="flex justify-center gap-3 mb-6">
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">🌙</div>
                                <button id="digit-0" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">⭐</div>
                                <button id="digit-1" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">☀️</div>
                                <button id="digit-2" class="w-16 h-16 bg-blue-500 text-white text-2xl font-bold rounded-lg hover:bg-blue-600 active:scale-95 transition">0</button>
                            </div>
                            <div class="symbol-digit text-center">
                                <div class="text-4xl mb-2">🌸</div>
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
                        // 正解は "1234" の例（変更可能）
                        return code === '1234';
                    },
                    spawnObjects: [
                        {
                            id: 'pen',
                            view: 'right',
                            x: 80,
                            y: 41,
                            width: 60,
                            height: 60,
                            imgSrc: './images/nazo.png',
                            description: 'シンボルパズルから得たペン。',
                            isCollectible: true,
                            maxUsageCount: 1
                        }
                    ]
                }
            });
        }
    }
    // 初回起動時に初期オブジェクトを登録
    registerInitialObjects();
    // GameManager からも呼べるようにwindowに登録
    window.registerInitialObjects = registerInitialObjects;
}

document.addEventListener('DOMContentLoaded', AppInit);
document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); });
