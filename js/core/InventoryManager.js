export class InventoryManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.slots = new Array(5).fill(null);
        this.selectedSlot = -1; // 選択中のスロット番号（-1 は未選択）
        this.setupInventoryUI();
    }

    // 指定したアイテムIDをインベントリから削除
    removeItemById(itemId) {
        const idx = this.slots.findIndex(item => item && item.id === itemId);
        if (idx !== -1) {
            this.slots[idx] = null;
            this.updateSlotUI(idx, null);
            // 選択状態も解除
            if (this.selectedSlot === idx) {
                this.clearSelection();
            }
            return true;
        }
        return false;
    }

    setupInventoryUI() {
        const inventoryContainer = document.getElementById('inventory-container');
        if (!inventoryContainer) return;

        const slots = inventoryContainer.children;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            slot.addEventListener('click', () => this.handleSlotClick(i));
        }
    }

    handleSlotClick(slotIndex) {
        const item = this.slots[slotIndex];
        if (!item) return; // 空スロットは無視

        if (this.selectedSlot === slotIndex) {
            // 同じスロットを2回クリック → 説明表示
            this.showItemDescription(slotIndex);
            // 選択状態は維持
        } else {
            // 別のスロットをクリック → 選択状態を切り替え
            this.selectSlot(slotIndex);
        }
    }

    selectSlot(slotIndex) {
        // 前の選択を解除
        if (this.selectedSlot !== -1) {
            const prevSlot = document.getElementById(`inventory-slot-${this.selectedSlot}`);
            if (prevSlot) {
                prevSlot.classList.remove('ring-2', 'ring-blue-500', 'scale-110');
            }
        }

        // 新しい選択を反映
        this.selectedSlot = slotIndex;
        const slot = document.getElementById(`inventory-slot-${slotIndex}`);
        if (slot) {
            slot.classList.add('ring-2', 'ring-blue-500', 'scale-110');
        }

        // 選択状態を通知
        const selectedItem = this.slots[slotIndex];
        const displayText = selectedItem.displayName || selectedItem.id;
        this.uiManager.updateStatus(`${displayText}を選択中`);
    }

    clearSelection() {
        if (this.selectedSlot !== -1) {
            const slot = document.getElementById(`inventory-slot-${this.selectedSlot}`);
            if (slot) {
                slot.classList.remove('ring-2', 'ring-blue-500', 'scale-110');
            }
            this.selectedSlot = -1;
        }
    }

    addItem(item) {
        const emptySlot = this.slots.findIndex(slot => slot === null);
        if (emptySlot === -1) {
            console.warn('インベントリがいっぱいです');
            return false;
        }

        // displayName が未指定ならインベントリ内でもそのままキープ（インベントリに入れた時点で保持）
        this.slots[emptySlot] = item;
        this.updateSlotUI(emptySlot, item);
        return true;
    }

    updateSlotUI(slotIndex, item) {
        const slot = document.getElementById(`inventory-slot-${slotIndex}`);
        if (!slot) return;

        if (item) {
            slot.innerHTML = `<img src="${item.imgSrc}" alt="${item.id}" class="w-8 h-8 rounded transition-transform">`;
            slot.classList.remove('bg-gray-400');
            slot.classList.add('bg-white', 'shadow-md', 'cursor-pointer', 'hover:scale-105', 'transition-all');
        } else {
            slot.innerHTML = '';
            slot.classList.add('bg-gray-400');
            slot.classList.remove('bg-white', 'shadow-md', 'cursor-pointer', 'hover:scale-105', 'ring-2', 'ring-blue-500', 'scale-110');
        }
    }

    showItemDescription(slotIndex) {
        const item = this.slots[slotIndex];
        if (!item) return;

        const titleText = item.displayName || item.id; // displayName が指定されていればそれを使用、なければ id
        const content = `
            <div class="p-4">
                <h3 class="text-xl font-bold mb-4">${titleText}</h3>
                <img src="${item.imgSrc}" alt="${item.id}" class="w-48 h-48 mx-auto mb-4 rounded cursor-pointer" data-item-id="${item.id}">
                <p class="text-gray-700">${item.description || 'アイテムの説明がありません。'}</p>
            </div>
        `;
        this.uiManager.showPuzzle(content);
        // 説明欄の画像クリック時の追加挙動
        try {
            const container = document.getElementById('puzzle-modal-content');
            if (container) {
                const img = container.querySelector('img[data-item-id]');
                if (img) {
                    const id = img.getAttribute('data-item-id');
                    img.addEventListener('click', async () => {
                        console.log(`${id}がクリックされました`);

                        // 条件: 対象が paper で、かつ pen を所持している場合
                        if (id === 'paper' && this.hasItem('pen')) {
                            // すでに記入済みを持っていれば何もしない
                            if (this.hasItem('paper-filled')) {
                                this.uiManager.updateStatus('すでに記入済みの申込書を所持しています。');
                                return;
                            }

                            // 先に paper を消してスロット確保（選択状態は内部で適切に解除される）
                            this.removeItemById('paper');

                            const newItem = {
                                id: 'paper-filled', displayName: '記入済みの申込書',
                                imgSrc: './images/paper-filled.png',
                                description: '記入済みの申込書。提出できそうだ。'
                            };

                            const ok = this.addItem(newItem);
                            if (ok) {
                                this.uiManager.updateStatus('記入済みの申込書を取得しました。');
                                
                                // 説明ウィンドウを閉じてから新しいアイテムの説明を開く
                                this.uiManager.hidePuzzle();
                                
                                // paper-filled が追加されたスロットを探して説明を表示
                                const newSlotIndex = this.slots.findIndex(item => item && item.id === 'paper-filled');
                                if (newSlotIndex !== -1) {
                                    // 少し遅延してから開く（モーダルのDOM更新を待つ）
                                    setTimeout(() => {
                                        this.showItemDescription(newSlotIndex);
                                    }, 100);
                                }
                                
                                // 可能ならセーブ（GameManager が注入されている場合）
                                try {
                                    if (this.gameManager && typeof this.gameManager.saveGameState === 'function') {
                                        await this.gameManager.saveGameState();
                                    }
                                } catch (e) {
                                    console.error('saveGameState error (paper-filled):', e);
                                }
                            } else {
                                this.uiManager.updateStatus('インベントリがいっぱいです。', true);
                            }
                        }
                    }, { once: false });
                }
            }
        } catch (_) { /* noop */ }
    }

    getSelectedItem() {
        if (this.selectedSlot === -1) return null;
        return this.slots[this.selectedSlot];
    }

    hasItem(itemId) {
        return this.slots.some(item => item && item.id === itemId);
    }

    toArray() {
        return this.slots.map(item => item ? { id: item.id, imgSrc: item.imgSrc, description: item.description, displayName: item.displayName } : null);
    }

    loadFromArray(arr) {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < this.slots.length; i++) {
            const v = arr[i] || null;
            this.slots[i] = v ? { id: v.id, imgSrc: v.imgSrc, description: v.description, displayName: v.displayName } : null;
            this.updateSlotUI(i, this.slots[i]);
        }
        // 選択状態はリセット
        this.clearSelection();
    }
}
