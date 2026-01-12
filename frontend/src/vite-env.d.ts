/// <reference types="vite/client" />

interface NiroPrinciplesResponse {
	ok: boolean
	content?: string
	error?: string
}

interface Window {
	niroPrinciples?: {
		getPrinciples: () => Promise<NiroPrinciplesResponse>
	}
}
