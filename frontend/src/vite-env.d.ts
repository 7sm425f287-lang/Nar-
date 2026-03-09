/// <reference types="vite/client" />

interface MoerlinPrinciplesResponse {
	ok: boolean
	content?: string
	error?: string
}

interface Window {
	moerlinPrinciples?: {
		getPrinciples: () => Promise<MoerlinPrinciplesResponse>
	}
}
