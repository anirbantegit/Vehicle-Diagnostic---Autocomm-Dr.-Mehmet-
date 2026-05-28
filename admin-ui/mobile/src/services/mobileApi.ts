import type {BaseQueryFn} from '@reduxjs/toolkit/query';
import {createApi} from '@reduxjs/toolkit/query/react';
import {
    forgetMobileToken,
    mobileRequest,
    storeMobileToken,
    type DiagnosticFunctionItem,
    type MobileRequestArgs,
    type MobileSession,
    type NativePopupResponse,
    type NativePopupState,
    type PairingClaimResponse,
    type RtdPopupAction,
    type VehicleContextResponse,
    type VehicleListType,
    type VehicleSelectionResponse,
    type VinHistoryItem,
} from '../mobileClient';

export type PairingCredentials = {
    pairingId: string;
    pairingSecret: string;
};

type MobileQueryError = {message: string};

type SelectionArgs = {
    type: VehicleListType;
    parentId?: string;
};

type OpenRtdArgs = {
    vehicleDefinitionId: string;
    rtdIndex: number;
};

type PopupActionArgs = {
    popupWindowHandle: number;
    action: RtdPopupAction;
    fallbackWindowHandle?: number;
    windowCloseFallback?: boolean;
};

type PopupLocationArgs = {
    popupWindowHandle: number;
    locationText: string;
    fallbackWindowHandle?: number;
};

const mobileBaseQuery: BaseQueryFn<MobileRequestArgs, unknown, MobileQueryError> = async (args) => {
    try {
        return {data: await mobileRequest<unknown>(args)};
    } catch (error) {
        return {error: {message: error instanceof Error ? error.message : String(error)}};
    }
};

export const mobileApi = createApi({
    reducerPath: 'mobileApi',
    baseQuery: mobileBaseQuery,
    tagTypes: ['Session', 'Vehicle', 'Vin'],
    endpoints: (builder) => ({
        claimPairing: builder.mutation<PairingClaimResponse, PairingCredentials>({
            query: ({pairingId, pairingSecret}) => ({
                path: '/bridge/pairing/claim',
                method: 'POST',
                authenticated: false,
                body: {
                    pairing_id: pairingId,
                    pairing_secret: pairingSecret,
                    client_name: `Phone Browser - ${navigator.platform || 'Mobile'}`,
                    client_type: 'mobile_web',
                },
            }),
            async onQueryStarted(_args, {queryFulfilled}) {
                try {
                    const {data} = await queryFulfilled;
                    storeMobileToken(data.access_token);
                } catch {
                    // The page renders the claim error; do not persist a partial session.
                }
            },
            invalidatesTags: ['Session'],
        }),
        getMobileSession: builder.query<MobileSession, void>({
            query: () => ({path: '/bridge/mobile/session'}),
            providesTags: ['Session'],
        }),
        disconnectMobileSession: builder.mutation<{disconnected: boolean}, void>({
            query: () => ({path: '/bridge/mobile/session', method: 'DELETE'}),
            async onQueryStarted(_args, {queryFulfilled}) {
                try {
                    await queryFulfilled;
                } finally {
                    forgetMobileToken();
                }
            },
            invalidatesTags: ['Session'],
        }),
        getVehicleSelection: builder.query<VehicleSelectionResponse, SelectionArgs>({
            query: ({type, parentId = ''}) => ({
                path: `/bridge/vehicles/${type}${parentId.trim() ? `/${encodeURIComponent(parentId.trim())}` : ''}`,
            }),
        }),
        activateVehicleContext: builder.mutation<VehicleContextResponse, string>({
            query: (vehicleDefinitionId) => ({
                path: '/bridge/mobile/vehicles/activate',
                method: 'POST',
                body: {vehicle_definition_id: vehicleDefinitionId, protocol: null},
            }),
            invalidatesTags: ['Vehicle'],
        }),
        getVehicleGuide: builder.query<unknown, string>({
            query: (vehicleDefinitionId) => ({path: `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/guide`}),
        }),
        getVehicleCapabilities: builder.query<unknown, string>({
            query: (vehicleDefinitionId) => ({path: `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/capabilities`}),
        }),
        getObdFunctions: builder.query<DiagnosticFunctionItem[], string>({
            query: (vehicleDefinitionId) => ({path: `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/obd-functions`}),
        }),
        getRtdFunctions: builder.query<DiagnosticFunctionItem[], string>({
            query: (vehicleDefinitionId) => ({path: `/bridge/vehicles/${encodeURIComponent(vehicleDefinitionId)}/rtd-functions`}),
        }),
        getVinAvailable: builder.query<boolean, void>({
            query: () => ({path: '/bridge/mobile/vin/isavailable'}),
            providesTags: ['Vin'],
        }),
        getVinHistory: builder.query<VinHistoryItem[], void>({
            query: () => ({path: '/bridge/mobile/vin/history'}),
            providesTags: ['Vin'],
        }),
        selectVehicleByVin: builder.mutation<unknown, string>({
            query: (vin) => ({path: '/bridge/mobile/vin/select', method: 'POST', body: {vin}}),
            invalidatesTags: ['Vehicle', 'Vin'],
        }),
        readVinFromVehicle: builder.mutation<unknown, void>({
            query: () => ({path: '/bridge/mobile/vin/read', method: 'POST'}),
            invalidatesTags: ['Vin'],
        }),
        openVehicleRtdFunction: builder.mutation<NativePopupResponse, OpenRtdArgs>({
            query: ({vehicleDefinitionId, rtdIndex}) => ({
                path: '/bridge/mobile/vehicles/rtd/open',
                method: 'POST',
                body: {
                    vehicle_definition_id: vehicleDefinitionId,
                    rtd_index: rtdIndex,
                    protocol: null,
                    timeout_seconds: 8,
                },
            }),
        }),
        getBlockingPopup: builder.query<NativePopupState, void>({
            query: () => ({path: '/bridge/mobile/automation/blocking-popup'}),
        }),
        invokeRtdPopupAction: builder.mutation<NativePopupState, PopupActionArgs>({
            query: ({popupWindowHandle, action, fallbackWindowHandle, windowCloseFallback = false}) => ({
                path: '/bridge/mobile/automation/rtd/popup-action',
                method: 'POST',
                body: {
                    window_handle: popupWindowHandle,
                    fallback_window_handle: fallbackWindowHandle,
                    action,
                    window_close_fallback: windowCloseFallback,
                },
            }),
        }),
        selectRtdLocation: builder.mutation<NativePopupState, PopupLocationArgs>({
            query: ({popupWindowHandle, locationText, fallbackWindowHandle}) => ({
                path: '/bridge/mobile/automation/rtd/select-location',
                method: 'POST',
                body: {
                    window_handle: popupWindowHandle,
                    fallback_window_handle: fallbackWindowHandle,
                    location_text: locationText,
                },
            }),
        }),
    }),
});

export const {
    useClaimPairingMutation,
    useLazyGetMobileSessionQuery,
    useDisconnectMobileSessionMutation,
    useLazyGetVehicleSelectionQuery,
    useActivateVehicleContextMutation,
    useLazyGetVehicleGuideQuery,
    useLazyGetVehicleCapabilitiesQuery,
    useLazyGetObdFunctionsQuery,
    useLazyGetRtdFunctionsQuery,
    useLazyGetVinAvailableQuery,
    useLazyGetVinHistoryQuery,
    useSelectVehicleByVinMutation,
    useReadVinFromVehicleMutation,
    useOpenVehicleRtdFunctionMutation,
    useGetBlockingPopupQuery,
    useInvokeRtdPopupActionMutation,
    useSelectRtdLocationMutation,
} = mobileApi;
