import {NavLink, Outlet} from 'react-router';

type NavigationItem = {
    to: string;
    label: string;
    description: string;
};

const debugItems: NavigationItem[] = [
    {to: '/debug/vehicle', label: 'Vehicle & RTD Test', description: 'Vehicle path, capabilities, RTD functions'},
    {to: '/debug/engine', label: 'Engine Runtime', description: 'SignalR, native UI tracing, hardware'},
    {to: '/debug/logs', label: 'Super Logs', description: 'Requests, responses, events'},
    {to: '/debug/runtime-notes', label: 'Runtime Notes', description: 'Local security and commands'},
];

function MenuLink({item}: {item: NavigationItem}) {
    return (
        <NavLink
            to={item.to}
            className={({isActive}) => [
                'block rounded-xl px-4 py-3 transition',
                isActive
                    ? 'bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)]'
                    : 'text-slate-200 hover:bg-white/8',
            ].join(' ')}
        >
            <span className="block text-sm font-bold">{item.label}</span>
            <span className="mt-1 block text-xs opacity-75">{item.description}</span>
        </NavLink>
    );
}

export default function AdminLayout() {
    return (
        <main className="grid min-h-screen grid-cols-[280px_1fr] bg-app-bg text-slate-900">
            <aside className="flex flex-col gap-5 bg-sidebar p-5 text-white">
                <header className="border-b border-white/15 pb-4">
                    <h1 className="m-0 text-[22px] font-extrabold leading-tight">Diagnostic Engine Console</h1>
                    <p className="mt-2 text-[13px] leading-5 text-slate-400">
                        Connect a mobile device first. Advanced diagnostic tools stay available under Debug for technicians.
                    </p>
                </header>
                <nav className="flex flex-col gap-2">
                    <p className="mx-2 mt-2 mb-1 text-[11px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">Getting started</p>
                    <MenuLink item={{to: '/connect', label: 'Connect Device', description: 'Health check, QR pairing, connected mobiles'}}/>
                    <p className="mx-2 mt-5 mb-1 text-[11px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">Debug</p>
                    <div className="ml-3 flex flex-col gap-1 border-l border-white/15 pl-3">
                        {debugItems.map((item) => <MenuLink key={item.to} item={item}/>)}
                    </div>
                </nav>
            </aside>
            <section className="overflow-auto p-7">
                <Outlet/>
            </section>
        </main>
    );
}