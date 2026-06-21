import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"


export default function Appointments() {
    return (
        <div className="text-navy w-full">
            <div className="fixed top-0 left-0 right-0 h-16 z-30 bg-navy/90 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center justify-between h-full px-5 md:px-8">
                    {/* Left: Title */}
                    <h2 className="text-xl md:text-2xl font-semibold text-white">
                        Appointments
                    </h2>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-3">

                    </div>
                </div>
            </div>

            {/* Main content area */}
            <div className="pt-16 pb-24 px-5 md:px-8 h-[calc(100vh-64px)] overflow-y-auto">

            </div>
        </div>
    )
}