#!/usr/bin/env python3
"""Write ios/Checksmith.xcodeproj/project.pbxproj.

The project file is generated rather than hand-typed so that every object id
is allocated once and every reference is guaranteed to resolve. Run this after
adding or removing a source file; `verify-project.py` checks the result.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.dirname(HERE)
PROJ = os.path.join(IOS, 'Checksmith.xcodeproj')

APP = 'Checksmith'
BUNDLE_ID = 'com.bluespindash.checksmith'
MARKETING_VERSION = '1.16.0'
PROJECT_VERSION = '19'
DEPLOYMENT_TARGET = '15.0'

SOURCES = ['AppDelegate.swift', 'GameViewController.swift']
RESOURCES = ['Assets.xcassets', 'LaunchScreen.storyboard']

_next = [0]


def oid(tag):
    """A stable 24-hex object id. Xcode only requires uniqueness within a file,
    and deriving them from a counter keeps regenerated projects diffable."""
    _next[0] += 1
    return '%024X' % (0xC4E5541700000000 + _next[0] * 0x9E3779B1)


def filetype(name):
    if name.endswith('.swift'):
        return 'sourcecode.swift'
    if name.endswith('.xcassets'):
        return 'folder.assetcatalog'
    if name.endswith('.storyboard'):
        return 'file.storyboard'
    if name.endswith('.plist'):
        return 'text.plist.xml'
    return 'text'


def main():
    ids = {}

    def new(key):
        ids[key] = oid(key)
        return ids[key]

    for name in SOURCES + RESOURCES + ['Info.plist']:
        new('ref:' + name)
    for name in SOURCES + RESOURCES:
        new('build:' + name)

    for key in ['project', 'target', 'product', 'mainGroup', 'appGroup', 'productsGroup',
                'sourcesPhase', 'resourcesPhase', 'frameworksPhase', 'scriptPhase',
                'projectConfigList', 'targetConfigList',
                'projectDebug', 'projectRelease', 'targetDebug', 'targetRelease']:
        new(key)

    out = []
    w = out.append
    w('// !$*UTF8*$!')
    w('{')
    w('\tarchiveVersion = 1;')
    w('\tclasses = {')
    w('\t};')
    w('\tobjectVersion = 54;')
    w('\tobjects = {')

    w('')
    w('/* Begin PBXBuildFile section */')
    for name in SOURCES + RESOURCES:
        w('\t\t%s /* %s in %s */ = {isa = PBXBuildFile; fileRef = %s /* %s */; };'
          % (ids['build:' + name], name,
             'Sources' if name.endswith('.swift') else 'Resources',
             ids['ref:' + name], name))
    w('/* End PBXBuildFile section */')

    w('')
    w('/* Begin PBXFileReference section */')
    w('\t\t%s /* %s.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; '
      'includeInIndex = 0; path = %s.app; sourceTree = BUILT_PRODUCTS_DIR; };'
      % (ids['product'], APP, APP))
    for name in SOURCES + RESOURCES + ['Info.plist']:
        w('\t\t%s /* %s */ = {isa = PBXFileReference; lastKnownFileType = %s; path = %s; '
          'sourceTree = "<group>"; };' % (ids['ref:' + name], name, filetype(name), name))
    w('/* End PBXFileReference section */')

    w('')
    w('/* Begin PBXFrameworksBuildPhase section */')
    w('\t\t%s /* Frameworks */ = {' % ids['frameworksPhase'])
    w('\t\t\tisa = PBXFrameworksBuildPhase;')
    w('\t\t\tbuildActionMask = 2147483647;')
    w('\t\t\tfiles = (')
    w('\t\t\t);')
    w('\t\t\trunOnlyForDeploymentPostprocessing = 0;')
    w('\t\t};')
    w('/* End PBXFrameworksBuildPhase section */')

    w('')
    w('/* Begin PBXGroup section */')
    w('\t\t%s = {' % ids['mainGroup'])
    w('\t\t\tisa = PBXGroup;')
    w('\t\t\tchildren = (')
    w('\t\t\t\t%s /* %s */,' % (ids['appGroup'], APP))
    w('\t\t\t\t%s /* Products */,' % ids['productsGroup'])
    w('\t\t\t);')
    w('\t\t\tsourceTree = "<group>";')
    w('\t\t};')
    w('\t\t%s /* %s */ = {' % (ids['appGroup'], APP))
    w('\t\t\tisa = PBXGroup;')
    w('\t\t\tchildren = (')
    for name in SOURCES + RESOURCES + ['Info.plist']:
        w('\t\t\t\t%s /* %s */,' % (ids['ref:' + name], name))
    w('\t\t\t);')
    w('\t\t\tpath = %s;' % APP)
    w('\t\t\tsourceTree = "<group>";')
    w('\t\t};')
    w('\t\t%s /* Products */ = {' % ids['productsGroup'])
    w('\t\t\tisa = PBXGroup;')
    w('\t\t\tchildren = (')
    w('\t\t\t\t%s /* %s.app */,' % (ids['product'], APP))
    w('\t\t\t);')
    w('\t\t\tname = Products;')
    w('\t\t\tsourceTree = "<group>";')
    w('\t\t};')
    w('/* End PBXGroup section */')

    w('')
    w('/* Begin PBXNativeTarget section */')
    w('\t\t%s /* %s */ = {' % (ids['target'], APP))
    w('\t\t\tisa = PBXNativeTarget;')
    w('\t\t\tbuildConfigurationList = %s /* Build configuration list for PBXNativeTarget "%s" */;'
      % (ids['targetConfigList'], APP))
    w('\t\t\tbuildPhases = (')
    w('\t\t\t\t%s /* Bundle the game page */,' % ids['scriptPhase'])
    w('\t\t\t\t%s /* Sources */,' % ids['sourcesPhase'])
    w('\t\t\t\t%s /* Frameworks */,' % ids['frameworksPhase'])
    w('\t\t\t\t%s /* Resources */,' % ids['resourcesPhase'])
    w('\t\t\t);')
    w('\t\t\tbuildRules = (')
    w('\t\t\t);')
    w('\t\t\tdependencies = (')
    w('\t\t\t);')
    w('\t\t\tname = %s;' % APP)
    w('\t\t\tproductName = %s;' % APP)
    w('\t\t\tproductReference = %s /* %s.app */;' % (ids['product'], APP))
    w('\t\t\tproductType = "com.apple.product-type.application";')
    w('\t\t};')
    w('/* End PBXNativeTarget section */')

    w('')
    w('/* Begin PBXProject section */')
    w('\t\t%s /* Project object */ = {' % ids['project'])
    w('\t\t\tisa = PBXProject;')
    w('\t\t\tattributes = {')
    w('\t\t\t\tBuildIndependentTargetsInParallel = 1;')
    w('\t\t\t\tLastSwiftUpdateCheck = 1500;')
    w('\t\t\t\tLastUpgradeCheck = 1500;')
    w('\t\t\t\tTargetAttributes = {')
    w('\t\t\t\t\t%s = {' % ids['target'])
    w('\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;')
    w('\t\t\t\t\t};')
    w('\t\t\t\t};')
    w('\t\t\t};')
    w('\t\t\tbuildConfigurationList = %s /* Build configuration list for PBXProject "%s" */;'
      % (ids['projectConfigList'], APP))
    w('\t\t\tcompatibilityVersion = "Xcode 14.0";')
    w('\t\t\tdevelopmentRegion = en;')
    w('\t\t\thasScannedForEncodings = 0;')
    w('\t\t\tknownRegions = (')
    w('\t\t\t\ten,')
    w('\t\t\t\tBase,')
    w('\t\t\t);')
    w('\t\t\tmainGroup = %s;' % ids['mainGroup'])
    w('\t\t\tproductRefGroup = %s /* Products */;' % ids['productsGroup'])
    w('\t\t\tprojectDirPath = "";')
    w('\t\t\tprojectRoot = "";')
    w('\t\t\ttargets = (')
    w('\t\t\t\t%s /* %s */,' % (ids['target'], APP))
    w('\t\t\t);')
    w('\t\t};')
    w('/* End PBXProject section */')

    w('')
    w('/* Begin PBXResourcesBuildPhase section */')
    w('\t\t%s /* Resources */ = {' % ids['resourcesPhase'])
    w('\t\t\tisa = PBXResourcesBuildPhase;')
    w('\t\t\tbuildActionMask = 2147483647;')
    w('\t\t\tfiles = (')
    for name in RESOURCES:
        w('\t\t\t\t%s /* %s in Resources */,' % (ids['build:' + name], name))
    w('\t\t\t);')
    w('\t\t\trunOnlyForDeploymentPostprocessing = 0;')
    w('\t\t};')
    w('/* End PBXResourcesBuildPhase section */')

    w('')
    w('/* Begin PBXShellScriptBuildPhase section */')
    w('\t\t%s /* Bundle the game page */ = {' % ids['scriptPhase'])
    w('\t\t\tisa = PBXShellScriptBuildPhase;')
    w('\t\t\talwaysOutOfDate = 1;')
    w('\t\t\tbuildActionMask = 2147483647;')
    w('\t\t\tfiles = (')
    w('\t\t\t);')
    w('\t\t\tinputPaths = (')
    w('\t\t\t\t"$(SRCROOT)/../index.html",')
    w('\t\t\t);')
    w('\t\t\tname = "Bundle the game page";')
    w('\t\t\toutputPaths = (')
    w('\t\t\t\t"$(BUILT_PRODUCTS_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/index.html",')
    w('\t\t\t);')
    w('\t\t\trunOnlyForDeploymentPostprocessing = 0;')
    w('\t\t\tshellPath = /bin/sh;')
    w('\t\t\tshellScript = "# The game is one self-contained file at the repository root.\\n'
      '# Copy it in on every build so the app can never ship a stale page.\\n'
      'set -e\\n'
      'cp \\"$SRCROOT/../index.html\\" \\"$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/index.html\\"\\n";')
    w('\t\t};')
    w('/* End PBXShellScriptBuildPhase section */')

    w('')
    w('/* Begin PBXSourcesBuildPhase section */')
    w('\t\t%s /* Sources */ = {' % ids['sourcesPhase'])
    w('\t\t\tisa = PBXSourcesBuildPhase;')
    w('\t\t\tbuildActionMask = 2147483647;')
    w('\t\t\tfiles = (')
    for name in SOURCES:
        w('\t\t\t\t%s /* %s in Sources */,' % (ids['build:' + name], name))
    w('\t\t\t);')
    w('\t\t\trunOnlyForDeploymentPostprocessing = 0;')
    w('\t\t};')
    w('/* End PBXSourcesBuildPhase section */')

    common = [
        'ALWAYS_SEARCH_USER_PATHS = NO;',
        'CLANG_ENABLE_MODULES = YES;',
        'CLANG_ENABLE_OBJC_ARC = YES;',
        'COPY_PHASE_STRIP = NO;',
        'ENABLE_STRICT_OBJC_MSGSEND = YES;',
        'GCC_C_LANGUAGE_STANDARD = gnu17;',
        'IPHONEOS_DEPLOYMENT_TARGET = %s;' % DEPLOYMENT_TARGET,
        'MTL_FAST_MATH = YES;',
        'SDKROOT = iphoneos;',
        'SWIFT_VERSION = 5.0;',
    ]
    target_common = [
        'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
        'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;',
        'CODE_SIGN_STYLE = Automatic;',
        'CURRENT_PROJECT_VERSION = %s;' % PROJECT_VERSION,
        'GENERATE_INFOPLIST_FILE = NO;',
        'INFOPLIST_FILE = %s/Info.plist;' % APP,
        'LD_RUNPATH_SEARCH_PATHS = (',
        '\t"$(inherited)",',
        '\t"@executable_path/Frameworks",',
        ');',
        'MARKETING_VERSION = %s;' % MARKETING_VERSION,
        'PRODUCT_BUNDLE_IDENTIFIER = %s;' % BUNDLE_ID,
        'PRODUCT_NAME = "$(TARGET_NAME)";',
        'SWIFT_EMIT_LOC_STRINGS = YES;',
        'TARGETED_DEVICE_FAMILY = "1,2";',
    ]

    def config(key, name, settings, extra):
        w('\t\t%s /* %s */ = {' % (ids[key], name))
        w('\t\t\tisa = XCBuildConfiguration;')
        w('\t\t\tbuildSettings = {')
        for line in settings + extra:
            w('\t\t\t\t' + line)
        w('\t\t\t};')
        w('\t\t\tname = %s;' % name)
        w('\t\t};')

    w('')
    w('/* Begin XCBuildConfiguration section */')
    config('projectDebug', 'Debug', common, [
        'DEBUG_INFORMATION_FORMAT = dwarf;',
        'ENABLE_TESTABILITY = YES;',
        'GCC_OPTIMIZATION_LEVEL = 0;',
        'GCC_PREPROCESSOR_DEFINITIONS = (', '\t"DEBUG=1",', '\t"$(inherited)",', ');',
        'MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;',
        'ONLY_ACTIVE_ARCH = YES;',
        'SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";',
        'SWIFT_OPTIMIZATION_LEVEL = "-Onone";',
    ])
    config('projectRelease', 'Release', common, [
        'DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";',
        'ENABLE_NS_ASSERTIONS = NO;',
        'MTL_ENABLE_DEBUG_INFO = NO;',
        'SWIFT_COMPILATION_MODE = wholemodule;',
        'VALIDATE_PRODUCT = YES;',
    ])
    config('targetDebug', 'Debug', target_common, [])
    config('targetRelease', 'Release', target_common, [])
    w('/* End XCBuildConfiguration section */')

    w('')
    w('/* Begin XCConfigurationList section */')
    for key, label, debug, release in [
        ('projectConfigList', 'PBXProject "%s"' % APP, 'projectDebug', 'projectRelease'),
        ('targetConfigList', 'PBXNativeTarget "%s"' % APP, 'targetDebug', 'targetRelease'),
    ]:
        w('\t\t%s /* Build configuration list for %s */ = {' % (ids[key], label))
        w('\t\t\tisa = XCConfigurationList;')
        w('\t\t\tbuildConfigurations = (')
        w('\t\t\t\t%s /* Debug */,' % ids[debug])
        w('\t\t\t\t%s /* Release */,' % ids[release])
        w('\t\t\t);')
        w('\t\t\tdefaultConfigurationIsVisible = 0;')
        w('\t\t\tdefaultConfigurationName = Release;')
        w('\t\t};')
    w('/* End XCConfigurationList section */')

    w('\t};')
    w('\trootObject = %s /* Project object */;' % ids['project'])
    w('}')

    os.makedirs(PROJ, exist_ok=True)
    with open(os.path.join(PROJ, 'project.pbxproj'), 'w') as fh:
        fh.write('\n'.join(out) + '\n')
    print('wrote', os.path.relpath(os.path.join(PROJ, 'project.pbxproj'), os.path.dirname(IOS)))


if __name__ == '__main__':
    main()
