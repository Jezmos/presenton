"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { toast } from "sonner";
import * as z from 'zod';
import { useDispatch } from 'react-redux';
import { setLayoutLoading } from '@/store/slices/presentationGeneration';
export interface LayoutInfo {
    id: string;
    name?: string;
    description?: string;
    json_schema: any;
    groupName: string;
}

export interface GroupSetting {
    description: string;
    ordered: boolean;
    default?: boolean;
}

export interface GroupedLayoutsResponse {
    groupName: string;
    files: string[];
    settings: GroupSetting | null;
}

export interface LayoutData {
    layoutsById: Map<string, LayoutInfo>;
    layoutsByGroup: Map<string, Set<string>>;
    groupSettings: Map<string, GroupSetting>;
    fileMap: Map<string, { fileName: string; groupName: string }>;
    groupedLayouts: Map<string, LayoutInfo[]>;
    layoutSchema: LayoutInfo[];
}

export interface LayoutContextType {
    getLayoutById: (layoutId: string) => LayoutInfo | null;
    getLayoutByIdAndGroup: (layoutId: string, groupName: string) => LayoutInfo | null;
    getLayoutsByGroup: (groupName: string) => LayoutInfo[];
    getGroupSetting: (groupName: string) => GroupSetting | null;
    getAllGroups: () => string[];
    getAllLayouts: () => LayoutInfo[];

    loading: boolean;
    error: string | null;
    getLayout: (layoutId: string) => React.ComponentType<{ data: any }> | null;
    isPreloading: boolean;
    cacheSize: number;
    refetch: () => Promise<void>;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

const layoutCache = new Map<string, React.ComponentType<{ data: any }>>();

const createCacheKey = (groupName: string, fileName: string): string => `${groupName}/${fileName}`;

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPreloading, setIsPreloading] = useState(false);
    const dispatch = useDispatch();

    const buildData = async (groupedLayoutsData: GroupedLayoutsResponse[]) => {
        const layouts: LayoutInfo[] = [];

        const layoutsById = new Map<string, LayoutInfo>();
        const layoutsByGroup = new Map<string, Set<string>>();
        const groupSettingsMap = new Map<string, GroupSetting>();
        const fileMap = new Map<string, { fileName: string; groupName: string }>();
        const groupedLayouts = new Map<string, LayoutInfo[]>();

        // Start preloading process
        setIsPreloading(true);

        try {
            for (const groupData of groupedLayoutsData) {

                // Initialize group
                if (!layoutsByGroup.has(groupData.groupName)) {
                    layoutsByGroup.set(groupData.groupName, new Set());
                }

                // group settings or default settings
                const settings = groupData.settings || {
                    description: `${groupData.groupName} presentation layouts`,
                    ordered: false,
                    default: false
                };

                groupSettingsMap.set(groupData.groupName, settings);
                const groupLayouts: LayoutInfo[] = [];

                for (const fileName of groupData.files) {
                    try {
                        const file = fileName.replace('.tsx', '').replace('.ts', '');

                        const module = await import(`@/presentation-layouts/${groupData.groupName}/${file}`);

                        if (!module.default) {
                            toast.error(`${file} has no default export`, {
                                description: 'Please ensure the layout file exports a default component',
                            });
                            console.warn(`❌ ${file} has no default export`);
                            continue;
                        }

                        if (!module.Schema) {
                            toast.error(`${file} has no Schema export`, {
                                description: 'Please ensure the layout file exports a Schema',
                            });
                            console.warn(`❌ ${file} has no Schema export`);
                            continue;
                        }

                        // Cache the layout component immediately after import
                        const cacheKey = createCacheKey(groupData.groupName, fileName);
                        if (!layoutCache.has(cacheKey)) {
                            layoutCache.set(cacheKey, module.default);
                        }

                        const originalLayoutId = module.layoutId || file.toLowerCase().replace(/layout$/, '');
                        const uniqueKey = `${groupData.groupName}:${originalLayoutId}`;
                        const layoutName = module.layoutName || file.replace(/([A-Z])/g, ' $1').trim();
                        const layoutDescription = module.layoutDescription || `${layoutName} layout for presentations`;

                        const jsonSchema = z.toJSONSchema(module.Schema, {
                            override: (ctx) => {
                                delete ctx.jsonSchema.default;
                            },
                        });

                        const layout: LayoutInfo = {
                            id: uniqueKey,
                            name: layoutName,
                            description: layoutDescription,
                            json_schema: jsonSchema,
                            groupName: groupData.groupName,
                        };

                        layoutsById.set(uniqueKey, layout);
                        layoutsByGroup.get(groupData.groupName)!.add(uniqueKey);
                        fileMap.set(uniqueKey, { fileName, groupName: groupData.groupName });
                        groupLayouts.push(layout);
                        layouts.push(layout);

                    } catch (error) {
                        console.error(`💥 Error extracting schema for ${fileName} from ${groupData.groupName}:`, error);
                    }
                }

                // Cache grouped layouts
                groupedLayouts.set(groupData.groupName, groupLayouts);
            }
        } finally {
            setIsPreloading(false);
        }

        return {
            layoutsById,
            layoutsByGroup,
            groupSettings: groupSettingsMap,
            fileMap,
            groupedLayouts,
            layoutSchema: layouts
        };
    };


    const loadLayouts = async () => {
        try {
            setLoading(true);
            setError(null);
            dispatch(setLayoutLoading(true));


            const layoutResponse = await fetch('/api/layouts');

            if (!layoutResponse.ok) {
                throw new Error(`Failed to fetch layouts: ${layoutResponse.statusText}`);
            }

            const groupedLayoutsData: GroupedLayoutsResponse[] = await layoutResponse.json();


            if (!groupedLayoutsData || groupedLayoutsData.length === 0) {
                console.warn('⚠️ API returned empty data');
                setError('No layout groups found');
                return;
            }

            const data = await buildData(groupedLayoutsData);
            setLayoutData(data);

            // The preloading is now handled within buildData
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load layouts';
            setError(errorMessage);
            console.error('💥 Error loading layouts:', err);
        } finally {
            dispatch(setLayoutLoading(false));
            setLoading(false);
        }
    };

    const getLayout = (layoutId: string): React.ComponentType<{ data: any }> | null => {
        if (!layoutData) return null;

        let fileInfo: { fileName: string; groupName: string } | undefined;

        // Search through all fileMap entries to find the layout
        for (const [key, info] of Array.from(layoutData.fileMap.entries())) {
            if (key === layoutId) {
                fileInfo = info;
                break;
            }
        }

        if (!fileInfo) {
            console.warn(`No file info found for layout: ${layoutId}`);
            return null;
        }

        const cacheKey = createCacheKey(fileInfo.groupName, fileInfo.fileName);

        // Return cached layout if available
        if (layoutCache.has(cacheKey)) {
            return layoutCache.get(cacheKey)!;
        }
        // Create and cache layout if not available
        const file = fileInfo.fileName.replace('.tsx', '').replace('.ts', '');
        const Layout = dynamic(
            () => import(`@/presentation-layouts/${fileInfo.groupName}/${file}`),
            {
                loading: () => <div className="w-full aspect-[16/9] bg-gray-100 animate-pulse rounded-lg" />,
                ssr: false,
            }
        ) as React.ComponentType<{ data: any }>;

        layoutCache.set(cacheKey, Layout);
        return Layout;
    };

    // Updated accessor methods to handle group-specific lookups
    const getLayoutById = (layoutId: string): LayoutInfo | null => {
        if (!layoutData) return null;

        // Search through all entries to find the layout (since we don't know the group)
        for (const [key, layout] of Array.from(layoutData.layoutsById.entries())) {
            if (key === layoutId) {
                return layout;
            }
        }
        return null;
    };

    const getLayoutByIdAndGroup = (layoutId: string, groupName: string): LayoutInfo | null => {
        if (!layoutData) return null;
        return layoutData.layoutsById.get(layoutId) || null;
    };

    const getLayoutsByGroup = (groupName: string): LayoutInfo[] => {
        return layoutData?.groupedLayouts.get(groupName) || [];
    };

    const getGroupSetting = (groupName: string): GroupSetting | null => {
        return layoutData?.groupSettings.get(groupName) || null;
    };

    const getAllGroups = (): string[] => {
        return layoutData ? Array.from(layoutData.groupSettings.keys()) : [];
    };

    const getAllLayouts = (): LayoutInfo[] => {
        return layoutData?.layoutSchema || [];
    };

    // Load layouts on mount
    useEffect(() => {
        loadLayouts();
    }, []);

    const contextValue: LayoutContextType = {

        getLayoutById,
        getLayoutByIdAndGroup,
        getLayoutsByGroup,
        getGroupSetting,
        getAllGroups,
        getAllLayouts,

        loading,
        error,
        getLayout,
        isPreloading,
        cacheSize: layoutCache.size,
        refetch: loadLayouts,
    };

    return (
        <LayoutContext.Provider value={contextValue}>
            {children}
        </LayoutContext.Provider>
    );
};

export const useLayout = (): LayoutContextType => {
    const context = useContext(LayoutContext);
    if (context === undefined) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
}; 