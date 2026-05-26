import {createApi} from '@reduxjs/toolkit/query/react';
import type {BaseQueryFn} from '@reduxjs/toolkit/query';
import type {
    BridgeIdentity,
    ClientsResponse,
    HealthResponse,
    NativeControlSelector,
    PairingStartResponse,
    PairingStatusResponse,
    RtdOpenResponse,
    RtdPopupAction,
    TraceScreenResponse,
    TraceWindowsResponse,
} from '../api/bridgeClient';
import {bridgeRequest} from '../api/bridgeClient';

type BridgeRequestArgs = {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    authenticated?: boolean;
};

type BridgeQueryError = {message: string};

const bridgeBaseQuery: BaseQueryFn<BridgeRequestArgs, unknown, BridgeQueryError> = async ({
    path,
    method = 'GET',
    body,
    authenticated = true,
}) => {
    try {
        const data = await bridgeRequest<unknown>(
            path,
            {
                method,
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            authenticated,
        );
        return {data};
    } catch (error) {
        return {error: {message: error instanceof Error ? error.message : String(error)}};
    }
};

export const bridgeApi = createApi({
    reducerPath: 'bridgeApi',
    baseQuery: bridgeBaseQuery,
    tagTypes: ['Health', 'Clients'],
    endpoints: (builder) => ({
        getHealth: builder.query<HealthResponse, void>({
            query: () => ({path: '/bridge/admin/health'}),
            providesTags: ['Health'],
        }),
        getPublicIdentity: builder.query<BridgeIdentity, void>({
            query: () => ({path: '/bridge/public/identity', authenticated: false}),
        }),
        getClients: builder.query<ClientsResponse, void>({
            query: () => ({path: '/bridge/clients'}),
            providesTags: ['Clients'],
        }),
        startPairing: builder.mutation<PairingStartResponse, void>({
            query: () => ({path: '/bridge/pairing/start', method: 'POST'}),
        }),
        getPairingStatus: builder.query<PairingStatusResponse, string>({
            query: (pairingId) => ({path: `/bridge/pairing/${encodeURIComponent(pairingId)}/status`}),
        }),
        revokeClient: builder.mutation<unknown, string>({
            query: (clientId) => ({
                path: `/bridge/clients/${encodeURIComponent(clientId)}/revoke`,
                method: 'POST',
            }),
            invalidatesTags: ['Clients', 'Health'],
        }),
        getTraceWindows: builder.query<TraceWindowsResponse, void>({
            query: () => ({path: '/bridge/admin/trace/windows'}),
        }),
        getTraceWindowScreen: builder.query<
            TraceScreenResponse,
            {windowHandle: number; includePreview?: boolean}
        >({
            query: ({windowHandle, includePreview = true}) => ({
                path: `/bridge/admin/trace/windows/${windowHandle}/screen${includePreview ? '' : '?include_preview=false'}`,
            }),
        }),
        clickTraceWindowPoint: builder.mutation<TraceScreenResponse, {windowHandle: number; x: number; y: number}>({
            query: ({windowHandle, x, y}) => ({
                path: `/bridge/admin/trace/windows/${windowHandle}/click-point`,
                method: 'POST',
                body: {x, y},
            }),
        }),
        invokeNativeControl: builder.mutation<TraceScreenResponse, {windowHandle: number; selector: NativeControlSelector; action: 'invoke' | 'select' | 'toggle'}>({
            query: ({windowHandle, selector, action}) => ({
                path: `/bridge/admin/trace/windows/${windowHandle}/control-action`,
                method: 'POST',
                body: {...selector, action},
            }),
        }),
        openRtdPopupAndConfirm: builder.mutation<RtdOpenResponse, {windowHandle: number; rtdIndex: number}>({
            query: ({windowHandle, rtdIndex}) => ({
                path: '/bridge/admin/automation/rtd/open',
                method: 'POST',
                body: {window_handle: windowHandle, rtd_index: rtdIndex},
            }),
        }),
        invokeRtdPopupAction: builder.mutation<TraceScreenResponse, {windowHandle: number; fallbackWindowHandle?: number; action: RtdPopupAction}>({
            query: ({windowHandle, fallbackWindowHandle, action}) => ({
                path: '/bridge/admin/automation/rtd/popup-action',
                method: 'POST',
                body: {
                    window_handle: windowHandle,
                    fallback_window_handle: fallbackWindowHandle,
                    action,
                },
            }),
        }),
        selectRtdLocation: builder.mutation<TraceScreenResponse, {windowHandle: number; fallbackWindowHandle?: number; locationText: string}>({
            query: ({windowHandle, fallbackWindowHandle, locationText}) => ({
                path: '/bridge/admin/automation/rtd/select-location',
                method: 'POST',
                body: {
                    window_handle: windowHandle,
                    fallback_window_handle: fallbackWindowHandle,
                    location_text: locationText,
                },
            }),
        }),
    }),
});

export const {
    useGetHealthQuery,
    useGetPublicIdentityQuery,
    useGetClientsQuery,
    useStartPairingMutation,
    useGetPairingStatusQuery,
    useRevokeClientMutation,
    useLazyGetTraceWindowsQuery,
    useLazyGetTraceWindowScreenQuery,
    useClickTraceWindowPointMutation,
    useInvokeNativeControlMutation,
    useOpenRtdPopupAndConfirmMutation,
    useInvokeRtdPopupActionMutation,
    useSelectRtdLocationMutation,
} = bridgeApi;