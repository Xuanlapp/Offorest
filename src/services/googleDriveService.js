// src/services/googleDriveService.js

const API_BASE_URL = 'https://nhxlap.id.vn/wp-json/offorest-api/v1';
const API_TEST_URL = 'http://offorest-wp.com.vn/wp-json/offorest-api/v1';
const PAGE_STORAGE_KEYS = {
	combosticker: 'comboStickerSheetData',
	holoarcylic: 'holoarcylicSheetUrl',
	suncatcher: 'suncatcherSheetUrl',
	sticker: 'stickerSheetUrl',
	mockup: 'mockupSheetUrl',
	patch: 'patchSheetUrl',
	stickercopy: 'stickerCopySheetUrl',
};

const LEGACY_PAGE_STORAGE_KEYS = {
	suncatcher: 'ornamentSheetUrl',
};

const extractSheetFromUrl = (url) => {
	if (!url) return { sheetId: null, gid: null };
	const idMatch = String(url).match(/\/d\/([a-zA-Z0-9-_]+)/);
	const gidMatch = String(url).match(/[?#&]gid=(\d+)/);
	return {
		sheetId: idMatch ? idMatch[1] : null,
		gid: gidMatch ? gidMatch[1] : null,
	};
};

const getConfiguredSheetByPage = (pageKey) => {
	if (!pageKey) return { sheetId: null, gid: null, source: null };
	const normalizedPage = String(pageKey).toLowerCase();

	if (normalizedPage === 'combosticker') {
		const raw = localStorage.getItem(PAGE_STORAGE_KEYS.combosticker);
		if (!raw) return { sheetId: null, gid: null, source: PAGE_STORAGE_KEYS.combosticker };
		try {
			const parsed = JSON.parse(raw);
			return {
				sheetId: parsed?.sheetId || null,
				gid: parsed?.gid != null ? String(parsed.gid) : null,
				source: PAGE_STORAGE_KEYS.combosticker,
			};
		} catch {
			return { sheetId: null, gid: null, source: PAGE_STORAGE_KEYS.combosticker };
		}
	}

	const storageKey = PAGE_STORAGE_KEYS[normalizedPage];
	if (!storageKey) return { sheetId: null, gid: null, source: null };

	const url = localStorage.getItem(storageKey) || localStorage.getItem(LEGACY_PAGE_STORAGE_KEYS[normalizedPage] || '');
	const extracted = extractSheetFromUrl(url);
	return { ...extracted, source: storageKey };
};

const validateSheetContext = ({ pageKey = null, sheetId, gid = null }) => {
	if (!pageKey) return;

	const configured = getConfiguredSheetByPage(pageKey);
	if (!configured.sheetId) {
		throw new Error(`Chưa cấu hình Sheet cho page ${pageKey}. Vui lòng nhập lại trên Navbar.`);
	}

	if (String(configured.sheetId) !== String(sheetId)) {
		throw new Error(
			`sheetId không khớp page ${pageKey}. Đang gửi ${sheetId}, nhưng cấu hình hiện tại là ${configured.sheetId}.`
		);
	}

	if (gid != null && configured.gid != null && String(configured.gid) !== String(gid)) {
		throw new Error(
			`gid không khớp page ${pageKey}. Đang gửi ${gid}, nhưng cấu hình hiện tại là ${configured.gid}.`
		);
	}
};

const maskToken = (token) => {
	const value = String(token || '');
	if (!value) return '';
	if (value.length <= 10) return `${value.slice(0, 3)}...`;
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const toLoggableRequestValue = (value) => {
	if (value instanceof File) {
		return {
			type: 'file',
			name: value.name,
			size: value.size,
			mimeType: value.type,
		};
	}

	return {
		type: 'field',
		value: String(value ?? ''),
	};
};

const logFormDataPayload = (label, formData) => {
	const entries = [];
	for (const [key, value] of formData.entries()) {
		entries.push({
			key,
			...toLoggableRequestValue(value),
		});
	}


};

async function getWordPressAuthHeaders() {
	const headers = {};

	const userStr = localStorage.getItem('user');
	if (userStr) {
		try {
			const user = JSON.parse(userStr);
			if (user.token) {
				headers['Authorization'] = `Bearer ${user.token}`;
				return headers;
			}
		} catch {
			// Ignore invalid cached user payload.
		}
	}

	try {
		const nonceResp = await fetch(`${API_BASE_URL}/nonce`, {
			method: 'GET',
			credentials: 'include',
		});

		if (nonceResp.ok) {
			const nonceData = await nonceResp.json();
			if (nonceData.nonce) {
				headers['X-WP-Nonce'] = nonceData.nonce;
				return headers;
			}
		}
	} catch {
		// Ignore nonce fetch errors; fallback to token/cookie-less request.
	}

	return headers;
}

export async function uploadFilesToBackend(files, keyword, sheetId, accessToken, gid = null, pageKey = null) {
	if (!Array.isArray(files) || files.length === 0) {
		throw new Error('Không có file để upload');
	}

	if (!sheetId) {
		throw new Error('Thiếu sheetId');
	}

	if (!accessToken) {
		throw new Error('Thiếu Google accessToken');
	}

	validateSheetContext({ pageKey, sheetId, gid });

	const formData = new FormData();
	formData.append('keyword', keyword || '');
	formData.append('sheetId', sheetId);
	formData.append('accessToken', accessToken);

	if (gid !== null && gid !== undefined) {
		formData.append('gid', String(gid));
	}

	files.forEach((file, index) => {
		if (index === 0) {
			formData.append('file', file);
		}
		formData.append(`file_${index}`, file);
	});

	const authHeaders = await getWordPressAuthHeaders();
	const requestUrl = `${API_BASE_URL}/google/upload`;

	console.log('📤 [googleDriveService] Upload payload summary:', {
		requestUrl,
		pageKey,
		keyword: keyword || '',
		sheetId,
		gid,
		accessTokenPreview: maskToken(accessToken),
		fileCount: files.length,
		files: files.map((file, index) => ({
			index,
			name: file?.name,
			size: file?.size,
			type: file?.type,
		})),
	});
	logFormDataPayload('📤 [googleDriveService] Upload FormData entries:', formData);

	const response = await fetch(requestUrl, {
		method: 'POST',
		headers: {
			...authHeaders,
		},
		body: formData,
	});

	const responseText = await response.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch {
		responseData = { raw: responseText };
	}

	if (!response.ok) {
		console.error('❌ [googleDriveService] Upload failed response:', responseData);
		throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${responseText}`);
	}

	return responseData;
}

export async function updateDesignPageImages({
	sheetId,
	gid = null,
	accessToken,
	stt = null,
	redesignImageFile,
	lifestyleImageFiles = null,
	lifestyleImageFile = null,
	requireLifestyleImage = true,
	title = '',
	description = '',
	tags = null,
	marketplace = '',
	productDescription = '',
	bulletPoint1 = '',
	bulletPoint2 = '',
	bulletPoint3 = '',
	bulletPoint4 = '',
	bulletPoint5 = '',
	genericKeyword = '',
	pageKey = null,
}) {
	if (!sheetId) {
		throw new Error('Thiếu sheetId');
	}

	if (!accessToken) {
		throw new Error('Thiếu Google accessToken');
	}

	if (!redesignImageFile) {
		throw new Error('Thiếu ảnh redesign để update');
	}

	const normalizedLifestyleFiles = Array.isArray(lifestyleImageFiles)
		? lifestyleImageFiles.filter(Boolean)
		: lifestyleImageFile
			? [lifestyleImageFile]
			: [];

	if (requireLifestyleImage && !normalizedLifestyleFiles.length) {
		throw new Error('Thiếu ảnh lifestyle để update');
	}

	validateSheetContext({ pageKey, sheetId, gid });

	const formData = new FormData();
	formData.append('sheetId', sheetId);
	formData.append('accessToken', accessToken);
	if (gid !== null && gid !== undefined) formData.append('gid', String(gid));
	if (stt !== null && stt !== undefined) formData.append('stt', String(stt));

	formData.append('files[]', redesignImageFile);
	normalizedLifestyleFiles.forEach((file) => {
		formData.append('files[]', file);
	});

	const normalizedTitle = String(title || '').trim();
	const normalizedDescription = String(description || '').trim();
	const normalizedMarketplace = String(marketplace || '').trim();
	const normalizedProductDescription = String(productDescription || '').trim();
	const normalizedBulletPoint1 = String(bulletPoint1 || '').trim();
	const normalizedBulletPoint2 = String(bulletPoint2 || '').trim();
	const normalizedBulletPoint3 = String(bulletPoint3 || '').trim();
	const normalizedBulletPoint4 = String(bulletPoint4 || '').trim();
	const normalizedBulletPoint5 = String(bulletPoint5 || '').trim();
	const normalizedGenericKeyword = String(genericKeyword || '').trim();
	const normalizedTags = Array.isArray(tags)
		? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
		: typeof tags === 'string'
			? tags
				.split(',')
				.map((tag) => String(tag || '').trim())
				.filter(Boolean)
			: [];

	if (normalizedTitle) {
		formData.append('title', normalizedTitle);
		formData.append('TITLE', normalizedTitle);
	}

	if (normalizedDescription) {
		formData.append('description', normalizedDescription);
		formData.append('Description', normalizedDescription);
	}

	if (normalizedTags.length) {
		formData.append('tags', JSON.stringify(normalizedTags));
		formData.append('tag', normalizedTags.join(', '));
		formData.append('Tag', normalizedTags.join(', '));
	}

	if (normalizedMarketplace) {
		formData.append('marketplace', normalizedMarketplace);
	}

	if (normalizedProductDescription) {
		formData.append('product_description', normalizedProductDescription);
		formData.append('PRODUCT DESCRIPTION', normalizedProductDescription);
		formData.append('DESCRIPTION', normalizedProductDescription);
	}

	if (normalizedBulletPoint1) {
		formData.append('bullet_point_1', normalizedBulletPoint1);
		formData.append('BULLET POINT 1', normalizedBulletPoint1);
	}

	if (normalizedBulletPoint2) {
		formData.append('bullet_point_2', normalizedBulletPoint2);
		formData.append('BULLET POINT 2', normalizedBulletPoint2);
	}

	if (normalizedBulletPoint3) {
		formData.append('bullet_point_3', normalizedBulletPoint3);
		formData.append('BULLET POINT 3', normalizedBulletPoint3);
	}

	if (normalizedBulletPoint4) {
		formData.append('bullet_point_4', normalizedBulletPoint4);
		formData.append('BULLET POINT 4', normalizedBulletPoint4);
	}

	if (normalizedBulletPoint5) {
		formData.append('bullet_point_5', normalizedBulletPoint5);
		formData.append('BULLET POINT 5', normalizedBulletPoint5);
	}

	if (normalizedGenericKeyword) {
		formData.append('generic_keyword', normalizedGenericKeyword);
		formData.append('GENERIC KEYWORD', normalizedGenericKeyword);
		formData.append('GETNERIC KEYWORD', normalizedGenericKeyword);
	}

	const authHeaders = await getWordPressAuthHeaders();
	const requestUrl = `${API_BASE_URL}/google/update`;

	console.log('📤 [googleDriveService] Design update payload summary:', {
		requestUrl,
		pageKey,
		sheetId,
		gid,
		stt,
		accessTokenPreview: maskToken(accessToken),
		marketplace: normalizedMarketplace,
		titleLength: normalizedTitle.length,
		descriptionLength: normalizedDescription.length,
		tagsCount: normalizedTags.length,
		productDescriptionLength: normalizedProductDescription.length,
		bulletPointLengths: [
			normalizedBulletPoint1.length,
			normalizedBulletPoint2.length,
			normalizedBulletPoint3.length,
			normalizedBulletPoint4.length,
			normalizedBulletPoint5.length,
		],
		genericKeywordLength: normalizedGenericKeyword.length,
		fileFieldKey: 'files[]',
		fileCount: 1 + normalizedLifestyleFiles.length,
		filesOrder: ['redesign', ...normalizedLifestyleFiles.map((_, index) => `lifestyle_${index + 1}`)],
		files: {
			redesign: { name: redesignImageFile.name, size: redesignImageFile.size, type: redesignImageFile.type },
			lifestyle: normalizedLifestyleFiles.map((file, index) => ({
				index,
				name: file.name,
				size: file.size,
				type: file.type,
			})),
		},
	});
	logFormDataPayload('📤 [googleDriveService] Design update FormData entries:', formData);

	const resp = await fetch(requestUrl, {
		method: 'POST',
		headers: {
			...authHeaders,
		},
		body: formData,
	});
	const responseText = await resp.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch {
		responseData = { raw: responseText };
	}

	if (!resp.ok) {
		console.error('❌ [googleDriveService] Design update failed response:', responseData);
		throw new Error(`Update failed: ${resp.status} ${resp.statusText} - ${responseText}`);
	}

	return responseData;
}

export async function testBackendConnection() {
	try {
		const authHeaders = await getWordPressAuthHeaders();
		const testUrl = `${API_BASE_URL}/`;
		const resp = await fetch(testUrl, {
			method: 'GET',
			headers: authHeaders,
			credentials: 'include',
		});

		return resp.ok;
	} catch {
		return false;
	}
}

export async function updateRecordInSheet(sheetId, stt, gid = null, files = [], pageKey = null, metadata = null) {
	const accessToken = localStorage.getItem('googleDriveAccessToken');
	if (!accessToken) {
		throw new Error('Google access token not configured. Vui lòng nhập token Google Drive ở Navbar.');
	}

	const normalizedTitle = String(metadata?.title || '').trim();
	const normalizedDescription = String(metadata?.description || '').trim();
	const normalizedMarketplace = String(metadata?.marketplace || '').trim();
	const normalizedProductDescription = String(metadata?.productDescription || '').trim();
	const normalizedBulletPoint1 = String(metadata?.bulletPoint1 || '').trim();
	const normalizedBulletPoint2 = String(metadata?.bulletPoint2 || '').trim();
	const normalizedBulletPoint3 = String(metadata?.bulletPoint3 || '').trim();
	const normalizedBulletPoint4 = String(metadata?.bulletPoint4 || '').trim();
	const normalizedBulletPoint5 = String(metadata?.bulletPoint5 || '').trim();
	const normalizedGenericKeyword = String(metadata?.genericKeyword || '').trim();
	const normalizedTags = Array.isArray(metadata?.tags)
		? metadata.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
		: typeof metadata?.tags === 'string'
			? metadata.tags
				.split(',')
				.map((tag) => String(tag || '').trim())
				.filter(Boolean)
			: [];

	const hasFiles = Array.isArray(files) && files.length > 0;
	const updateUrl = `${API_BASE_URL}/google/update`;
	let resp;
	const authHeaders = await getWordPressAuthHeaders();

	validateSheetContext({ pageKey, sheetId, gid });

	if (hasFiles) {
		const formData = new FormData();
		files.forEach((file) => {
			formData.append('files[]', file);
		});
		formData.append('sheetId', sheetId);
		formData.append('accessToken', accessToken);
		if (gid !== null && gid !== undefined) formData.append('gid', gid);
		if (stt !== null && stt !== undefined) formData.append('stt', stt);
		if (normalizedTitle) {
			formData.append('title', normalizedTitle);
			formData.append('TITLE', normalizedTitle);
		}
		if (normalizedDescription) {
			formData.append('description', normalizedDescription);
			formData.append('Description', normalizedDescription);
		}
		if (normalizedTags.length) {
			formData.append('tags', JSON.stringify(normalizedTags));
			formData.append('tag', normalizedTags.join(', '));
			formData.append('Tag', normalizedTags.join(', '));
		}
		if (normalizedMarketplace) formData.append('marketplace', normalizedMarketplace);
		if (normalizedProductDescription) {
			formData.append('product_description', normalizedProductDescription);
			formData.append('DESCRIPTION', normalizedProductDescription);
		}
		if (normalizedBulletPoint1) {
			formData.append('bullet_point_1', normalizedBulletPoint1);
			formData.append('BULLET POINT 1', normalizedBulletPoint1);
		}
		if (normalizedBulletPoint2) {
			formData.append('bullet_point_2', normalizedBulletPoint2);
			formData.append('BULLET POINT 2', normalizedBulletPoint2);
		}
		if (normalizedBulletPoint3) {
			formData.append('bullet_point_3', normalizedBulletPoint3);
			formData.append('BULLET POINT 3', normalizedBulletPoint3);
		}
		if (normalizedBulletPoint4) {
			formData.append('bullet_point_4', normalizedBulletPoint4);
			formData.append('BULLET POINT 4', normalizedBulletPoint4);
		}
		if (normalizedBulletPoint5) {
			formData.append('bullet_point_5', normalizedBulletPoint5);
			formData.append('BULLET POINT 5', normalizedBulletPoint5);
		}
		if (normalizedGenericKeyword) {
			formData.append('generic_keyword', normalizedGenericKeyword);
			formData.append('GENERIC KEYWORD', normalizedGenericKeyword);
			formData.append('GETNERIC KEYWORD', normalizedGenericKeyword);
		}

		console.log('📤 [googleDriveService] updateRecordInSheet form payload summary:', {
			updateUrl,
			pageKey,
			sheetId,
			gid,
			stt,
			accessTokenPreview: maskToken(accessToken),
			fileCount: files.length,
		});
		logFormDataPayload('📤 [googleDriveService] updateRecordInSheet FormData entries:', formData);

		resp = await fetch(updateUrl, {
			method: 'POST',
			headers: {
				...authHeaders,
			},
			body: formData,
		});
	} else {
		const updatePayload = { sheetId, accessToken };
		if (gid !== null && gid !== undefined) updatePayload.gid = gid;
		if (stt !== null && stt !== undefined) updatePayload.stt = stt;
		if (normalizedTitle) {
			updatePayload.title = normalizedTitle;
			updatePayload.TITLE = normalizedTitle;
		}
		if (normalizedDescription) {
			updatePayload.description = normalizedDescription;
			updatePayload.Description = normalizedDescription;
		}
		if (normalizedTags.length) {
			updatePayload.tags = normalizedTags;
			updatePayload.tag = normalizedTags.join(', ');
			updatePayload.Tag = normalizedTags.join(', ');
		}
		if (normalizedMarketplace) updatePayload.marketplace = normalizedMarketplace;
		if (normalizedProductDescription) {
			updatePayload.product_description = normalizedProductDescription;
			updatePayload['PRODUCT DESCRIPTION'] = normalizedProductDescription;
			updatePayload.DESCRIPTION = normalizedProductDescription;
		}
		if (normalizedBulletPoint1) {
			updatePayload.bullet_point_1 = normalizedBulletPoint1;
			updatePayload['BULLET POINT 1'] = normalizedBulletPoint1;
		}
		if (normalizedBulletPoint2) {
			updatePayload.bullet_point_2 = normalizedBulletPoint2;
			updatePayload['BULLET POINT 2'] = normalizedBulletPoint2;
		}
		if (normalizedBulletPoint3) {
			updatePayload.bullet_point_3 = normalizedBulletPoint3;
			updatePayload['BULLET POINT 3'] = normalizedBulletPoint3;
		}
		if (normalizedBulletPoint4) {
			updatePayload.bullet_point_4 = normalizedBulletPoint4;
			updatePayload['BULLET POINT 4'] = normalizedBulletPoint4;
		}
		if (normalizedBulletPoint5) {
			updatePayload.bullet_point_5 = normalizedBulletPoint5;
			updatePayload['BULLET POINT 5'] = normalizedBulletPoint5;
		}
		if (normalizedGenericKeyword) {
			updatePayload.generic_keyword = normalizedGenericKeyword;
			updatePayload['GENERIC KEYWORD'] = normalizedGenericKeyword;
			updatePayload['GETNERIC KEYWORD'] = normalizedGenericKeyword;
		}
		console.log('📤 [googleDriveService] updateRecordInSheet JSON payload:', {
			...updatePayload,
			accessToken: maskToken(accessToken),
		});
		resp = await fetch(updateUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
			},
			body: JSON.stringify(updatePayload),
		});

	}

	const responseText = await resp.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch {
		responseData = { raw: responseText };
	}

	if (!resp.ok) {
		throw new Error(`Update failed: ${resp.status} ${resp.statusText} - ${responseText}`);
	}

	return responseData;
}
