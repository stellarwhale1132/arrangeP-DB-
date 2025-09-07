document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM 元素獲取 ---
    const imageGrid = document.getElementById('image-grid');
    const uploadBtn = document.getElementById('upload-btn');
    const imageUpload = document.getElementById('image-upload');
    const noteInput = document.getElementById('note-input');
    const tagInput = document.getElementById('tag-input');
    const addItemBtn = document.getElementById('add-item-btn');
    const dropZone = document.getElementById('drop-zone');
    const categoryList = document.getElementById('category-list');
    const newCategoryInput = document.getElementById('new-category-input');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const tagListContainer = document.getElementById('tag-list');
    const exportBtn = document.getElementById('export-data-btn');
    const importBtn = document.getElementById('import-data-btn');
    const importFileInput = document.getElementById('import-file-input');
    const themeToggle = document.getElementById('theme-toggle');
    const editModal = document.getElementById('edit-modal');
    const closeModalBtn = document.querySelector('.close-btn');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const editIdInput = document.getElementById('edit-id-input');
    const editNoteInput = document.getElementById('edit-note-input');
    const editTagInput = document.getElementById('edit-tag-input');
    const editCategorySelect = document.getElementById('edit-category-select');

    // --- IndexedDB 核心設定與輔助函式 ---
    const DB_NAME = 'ImagePromptDB';
    const DB_VERSION = 1;
    const ITEMS_STORE_NAME = 'items';
    const CATEGORIES_STORE_NAME = 'categories';
    let db;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject('IndexedDB error: ' + event.target.errorCode);
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(ITEMS_STORE_NAME)) {
                    db.createObjectStore(ITEMS_STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(CATEGORIES_STORE_NAME)) {
                    db.createObjectStore(CATEGORIES_STORE_NAME, { autoIncrement: true });
                }
            };
        });
    }

    function getAllData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject('Error fetching data: ' + event.target.error);
        });
    }

    function saveDataToDB(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();
            data.forEach(item => store.put(item));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject('Error saving data: ' + event.target.error);
        });
    }

    // --- 應用程式狀態管理 ---
    let items = [];
    let categories = [];
    let currentFilter = { type: 'all', value: 'all' };

    // --- 初始化 SortableJS ---
    let sortable = new Sortable(imageGrid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        handle: '.drag-handle',
        onEnd: async (evt) => {
            const movedItem = items.find(item => item.id === evt.item.dataset.id);
            if (!movedItem) return;
            items = items.filter(item => item.id !== evt.item.dataset.id);
            items.splice(evt.newIndex, 0, movedItem);
            await saveData();
        },
    });

    // --- 資料處理函式 ---
    async function saveData() {
        await Promise.all([
            saveDataToDB(ITEMS_STORE_NAME, items),
            saveDataToDB(CATEGORIES_STORE_NAME, categories.map(c => ({name: c})))
        ]);
    }

    async function loadData() {
        const [loadedItems, loadedCategoriesObj] = await Promise.all([
            getAllData(ITEMS_STORE_NAME),
            getAllData(CATEGORIES_STORE_NAME)
        ]);
        items = loadedItems || [];
        const categoryNames = loadedCategoriesObj.map(c => c.name);
        categories = categoryNames.length > 0 ? categoryNames : ['預設分類'];
    }

    // --- 渲染函式 ---
    const renderItems = () => {
        imageGrid.innerHTML = '';
        const filteredItems = items.filter(item => {
            if (currentFilter.type === 'all') return true;
            if (currentFilter.type === 'favorites') return item.isFavorite;
            if (currentFilter.type === 'uncategorized') return !item.category || item.category === "預設分類";
            if (currentFilter.type === 'category') return item.category === currentFilter.value;
            if (currentFilter.type === 'tag') return item.tags.includes(currentFilter.value);
            return false;
        });
        filteredItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.dataset.id = item.id;
            const tagsHTML = item.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
            card.innerHTML = `
                <img src="${item.imageData}" alt="Image">
                <i class="fa-solid fa-star favorite-btn ${item.isFavorite ? 'is-favorite' : ''}"></i>
                <div class="card-content">
                    <p class="card-note">${item.note || '<i>無備註</i>'}</p>
                    <div class="card-tags">${tagsHTML}</div>
                    <div class="card-actions">
                        <i class="fa-solid fa-grip-vertical drag-handle" title="按住拖曳排序"></i>
                        <div class="action-buttons-group">
                            <button class="action-btn btn-view" title="查看備註"><i class="fa-solid fa-eye"></i></button>
                            <button class="action-btn btn-copy" title="複製備註"><i class="fa-solid fa-copy"></i></button>
                            <button class="action-btn btn-edit" title="編輯"><i class="fa-solid fa-pencil"></i></button>
                            <button class="action-btn btn-delete" title="刪除"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `;
            imageGrid.appendChild(card);
        });
    };
    
    const renderCategories = () => {
        const customCategoriesContainer = categoryList.querySelector('li[data-category="uncategorized"]');
        const oldCustomCategories = categoryList.querySelectorAll('.custom-category');
        oldCustomCategories.forEach(li => li.remove());
        
        [...categories].reverse().forEach(cat => {
            if (cat !== "預設分類") {
                const li = document.createElement('li');
                li.dataset.category = cat;
                li.classList.add('custom-category');
                
                const categoryName = document.createElement('span');
                categoryName.textContent = cat;

                const actions = document.createElement('div');
                actions.className = 'category-actions';
                actions.innerHTML = `
                    <i class="fa-solid fa-pencil btn-edit-category" title="重新命名"></i>
                    <i class="fa-solid fa-trash btn-delete-category" title="刪除分類"></i>
                `;
                
                li.appendChild(categoryName);
                li.appendChild(actions);
                customCategoriesContainer.insertAdjacentElement('afterend', li);
            }
        });
        updateActiveFilter();
    };

    const renderTags = () => {
        const allTags = new Set(items.flatMap(item => item.tags));
        tagListContainer.innerHTML = '';
        allTags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.dataset.tag = tag;
            tagEl.textContent = tag;
            tagListContainer.appendChild(tagEl);
        });
         updateActiveFilter();
    };

    const updateActiveFilter = () => {
        document.querySelectorAll('.filter-list li, .tag-cloud .tag').forEach(el => {
            el.classList.remove('active');
            const type = el.dataset.category ? 'category' : 'tag';
            const value = el.dataset.category || el.dataset.tag;
            if ((currentFilter.type === 'all' && value === 'all') || (currentFilter.type === 'favorites' && value === 'favorites') || (currentFilter.type === 'uncategorized' && value === 'uncategorized') || (currentFilter.type === type && currentFilter.value === value)) {
                el.classList.add('active');
            }
        });
    };
    
    const refreshApp = () => {
        renderCategories();
        renderTags();
        renderItems();
    };

    // --- 核心功能函式 ---
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const note = noteInput.value.trim();
            const tags = tagInput.value.trim().split(/[,，\s]+/).filter(Boolean);
            const newItem = {
                id: Date.now().toString(), imageData: e.target.result, note: note, tags: tags, isFavorite: false, category: '預設分類'
            };
            items.unshift(newItem);
            await saveData();
            refreshApp();
            noteInput.value = '';
            tagInput.value = '';
            imageUpload.value = '';
        };
        reader.readAsDataURL(file);
    }

    async function handlePaste(e) {
        const clipboardItems = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of clipboardItems) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const newItem = {
                        id: Date.now().toString(), imageData: event.target.result, note: '', tags: [], isFavorite: false, category: '預設分類'
                    };
                    items.unshift(newItem);
                    await saveData();
                    refreshApp();
                };
                reader.readAsDataURL(file);
                e.preventDefault();
                break;
            }
        }
    }

    // --- 事件監聽器 ---
    uploadBtn.addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
    addItemBtn.addEventListener('click', () => {
        if (imageUpload.files.length > 0) handleFile(imageUpload.files[0]);
        else alert('請先選擇一張圖片！');
    });
    window.addEventListener('paste', handlePaste);
    dropZone.addEventListener('dragover', (e) => e.preventDefault());
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    
    imageGrid.addEventListener('click', async (e) => {
        const target = e.target.closest('button.action-btn, .favorite-btn');
        if (!target) return;
        const card = target.closest('.image-card');
        const id = card.dataset.id;
        const itemIndex = items.findIndex(item => item.id === id);
        if (itemIndex === -1) return;
        
        if (target.classList.contains('btn-view')) {
            alert(`完整備註：\n\n${items[itemIndex].note || '(無備註)'}`);
        }
        if (target.classList.contains('btn-copy')) {
            navigator.clipboard.writeText(items[itemIndex].note || '').then(() => alert('備註已複製！'));
        }
        if (target.classList.contains('btn-delete')) {
            if (confirm('確定要刪除這個項目嗎？')) {
                items.splice(itemIndex, 1);
                await saveData();
                refreshApp();
            }
        }
        if (target.classList.contains('btn-edit')) {
            const item = items[itemIndex];
            editIdInput.value = id;
            editNoteInput.value = item.note;
            editTagInput.value = item.tags.join(', ');
            editCategorySelect.innerHTML = '';
            ['預設分類', ...categories.filter(c => c !== '預設分類')].forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                if (item.category === cat) option.selected = true;
                editCategorySelect.appendChild(option);
            });
            editModal.style.display = 'flex';
        }
        
        // **BUG 修正點：將 'btn-favorite' 改為正確的 'favorite-btn'**
        if (target.classList.contains('favorite-btn')) {
            items[itemIndex].isFavorite = !items[itemIndex].isFavorite;
            await saveData();
            refreshApp();
        }
    });

    closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.style.display = 'none';
    });
    
    saveEditBtn.addEventListener('click', async () => {
        const id = editIdInput.value;
        const itemIndex = items.findIndex(item => item.id === id);
        if(itemIndex !== -1) {
            items[itemIndex].note = editNoteInput.value.trim();
            items[itemIndex].tags = editTagInput.value.trim().split(/[,，\s]+/).filter(Boolean);
            items[itemIndex].category = editCategorySelect.value;
            await saveData();
            refreshApp();
            editModal.style.display = 'none';
        }
    });

    addCategoryBtn.addEventListener('click', async () => {
        const newCategory = newCategoryInput.value.trim();
        if (newCategory && !categories.includes(newCategory) && newCategory !== '預設分類') {
            categories.push(newCategory);
            await saveData();
            renderCategories();
            newCategoryInput.value = '';
        } else if (!newCategory) alert('分類名稱不能為空！');
        else alert('該分類已存在！');
    });
    newCategoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCategoryBtn.click();
    });

    categoryList.addEventListener('click', async (e) => {
        const target = e.target;
        const parentLi = target.closest('li');
        if (!parentLi) return;

        const categoryName = parentLi.dataset.category;

        if (target.classList.contains('btn-delete-category')) {
            if (confirm(`確定要刪除「${categoryName}」分類嗎？\n(此分類中的圖片將會被移至「預設分類」)`)) {
                items.forEach(item => {
                    if (item.category === categoryName) {
                        item.category = '預設分類';
                    }
                });
                categories = categories.filter(c => c !== categoryName);
                if(currentFilter.type === 'category' && currentFilter.value === categoryName) {
                    currentFilter = { type: 'all', value: 'all' };
                }
                await saveData();
                refreshApp();
            }
        }
        else if (target.classList.contains('btn-edit-category')) {
            const newCategoryName = prompt(`請輸入「${categoryName}」的新名稱：`, categoryName);
            if (newCategoryName && newCategoryName.trim() !== '' && newCategoryName !== categoryName) {
                const trimmedNewName = newCategoryName.trim();
                if (categories.includes(trimmedNewName)) {
                    alert(`分類名稱「${trimmedNewName}」已存在！`);
                    return;
                }
                const categoryIndex = categories.findIndex(c => c === categoryName);
                if (categoryIndex !== -1) {
                    categories[categoryIndex] = trimmedNewName;
                }
                items.forEach(item => {
                    if (item.category === categoryName) {
                        item.category = trimmedNewName;
                    }
                });
                 if(currentFilter.type === 'category' && currentFilter.value === categoryName) {
                    currentFilter.value = trimmedNewName;
                }
                await saveData();
                refreshApp();
            }
        }
        else {
            if (['favorites', 'uncategorized', 'all'].includes(categoryName)) {
                currentFilter = { type: categoryName, value: categoryName };
            } else {
                currentFilter = { type: 'category', value: categoryName };
            }
            updateActiveFilter();
            renderItems();
        }
    });
    
    tagListContainer.addEventListener('click', (e) => {
         if (e.target.classList.contains('tag')) {
            const tag = e.target.dataset.tag;
            if(currentFilter.type === 'tag' && currentFilter.value === tag) {
                currentFilter = { type: 'all', value: 'all' };
            } else {
                currentFilter = { type: 'tag', value: tag };
            }
            updateActiveFilter();
            renderItems();
        }
    });
    
    exportBtn.addEventListener('click', () => {
        if (items.length === 0) return alert('沒有資料可以匯出。');
        const dataStr = JSON.stringify({ items, categories });
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
        a.download = `image_data_backup_${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!confirm('匯入將會覆蓋現有所有資料，確定要繼續嗎？')) {
                e.target.value = ''; return;
            }
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (importedData.items && importedData.categories) {
                        items = importedData.items;
                        categories = importedData.categories;
                        await saveData();
                        refreshApp();
                        alert('資料匯入成功！');
                    } else alert('檔案格式不正確。');
                } catch (err) {
                    alert('讀取檔案失敗，請確認檔案為正確的 JSON 格式。');
                } finally {
                    e.target.value = '';
                }
            };
            reader.readAsText(file);
        }
    });
    importBtn.addEventListener('click', () => importFileInput.click());
    
    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', themeToggle.checked);
        localStorage.setItem('theme', themeToggle.checked ? 'dark' : 'light');
    });

    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        }
    };
    
    // --- 應用程式啟動主函式 ---
    async function main() {
        await initDB();
        const oldData = localStorage.getItem('imageDataApp');
        if (oldData) {
            if (confirm('偵測到 localStorage 中的舊資料，是否要轉移到新的 IndexedDB 資料庫？\n(此操作只會進行一次)')) {
                try {
                    const appData = JSON.parse(oldData);
                    items = appData.items || [];
                    categories = appData.categories || ['預設分類'];
                    await saveData();
                    localStorage.removeItem('imageDataApp');
                    alert('資料轉移成功！您的資料現在更安全且效能更高。');
                } catch (e) {
                    alert('舊資料格式錯誤，轉移失敗。');
                }
            }
        }
        await loadData();
        loadTheme();
        refreshApp();
    }

    // 啟動！
    main();
});
