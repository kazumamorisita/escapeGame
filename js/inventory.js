
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

    // ...以下、既存のメソッドをすべてクラス内に移動...

    setupInventoryUI() {
        const inventoryContainer = document.getElementById('inventory-container');
        if (!inventoryContainer) return;

        const slots = inventoryContainer.children;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            slot.addEventListener('click', () => this.handleSlotClick(i));
        }
    }

    // スロットクリック時の処理を変更
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

    // アイテム選択処理を追加
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
        this.uiManager.updateStatus(`${selectedItem.id}を選択中`);
    }

    // 選択解除用メソッドを追加
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

        const content = `
            <div class="p-4">
                <h3 class="text-xl font-bold mb-4">${item.id}</h3>
                <img src="${item.imgSrc}" alt="${item.id}" class="w-24 h-24 mx-auto mb-4 rounded">
                <p class="text-gray-700">${item.description || 'アイテムの説明がありません。'}</p>
            </div>
        `;
        this.uiManager.showPuzzle(content);
    }

    // 現在選択中のアイテムを取得
    getSelectedItem() {
        if (this.selectedSlot === -1) return null;
        return this.slots[this.selectedSlot];
    }

    hasItem(itemId) {
        return this.slots.some(item => item && item.id === itemId);
    }

    // 現在のスロット配列を返す（null 含む）。DB 保存用。
    toArray() {
        return this.slots.map(item => item ? { id: item.id, imgSrc: item.imgSrc, description: item.description } : null);
    }

    // DB から復元するための補助。配列はスロット数と同じ長さか、短ければ残りは null と扱う。
    loadFromArray(arr) {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < this.slots.length; i++) {
            const v = arr[i] || null;
            this.slots[i] = v ? { id: v.id, imgSrc: v.imgSrc, description: v.description } : null;
            this.updateSlotUI(i, this.slots[i]);
        }
        // 選択状態はリセット
        this.clearSelection();
    }
}