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

        // 太陽シール申込書(記念日の謎を解くと出現)
        if (!gameObjectManager.objects.has('paper')) {
            gameObjectManager.addObject({
                id: 'paper',
                view: 'front',
                x: 70,
                y: 30,
                width: 48,
                height: 48,
                imgSrc: './images/nazo.png',
                description: '謎の申込用紙．名前を書くと太陽シールがもらえるらしい．',
                isCollectible: true,
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
                        }
                    ]
                }
            });
        }
        

        //オブジェクト(left)
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

    }
    // 初回起動時に初期オブジェクトを登録
    registerInitialObjects();
    // GameManager からも呼べるようにwindowに登録
    window.registerInitialObjects = registerInitialObjects;
}

document.addEventListener('DOMContentLoaded', AppInit);
document.addEventListener('DOMContentLoaded', () => { lucide.createIcons(); });
