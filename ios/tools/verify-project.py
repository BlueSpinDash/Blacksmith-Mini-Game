#!/usr/bin/env python3
"""Structural checks on the generated Xcode project.

Nothing here can build an app - that needs a Mac - but it does catch the
mistakes that actually break a hand-rolled project file: unbalanced
delimiters, an object id referenced but never defined, a build file pointing
at a missing source, or a target whose phases or configurations are not wired
up. Run: python3 ios/tools/verify-project.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.dirname(HERE)
ROOT = os.path.dirname(IOS)
PBX = os.path.join(IOS, 'Checksmith.xcodeproj', 'project.pbxproj')

fails = []
passes = [0]


def ok(name, cond, detail=''):
    if cond:
        passes[0] += 1
        print('  PASS  ' + name)
    else:
        fails.append(name)
        print('  FAIL  ' + name + (' -> ' + str(detail) if detail else ''))


def main():
    if not os.path.exists(PBX):
        print('no project file; run make-project.py first')
        return 1
    src = open(PBX).read()

    ok('the file declares itself a UTF-8 pbxproj', src.startswith('// !$*UTF8*$!'))
    for a, b, what in [('{', '}', 'braces'), ('(', ')', 'parentheses')]:
        ok('%s balance' % what, src.count(a) == src.count(b),
           '%d %s vs %d %s' % (src.count(a), a, src.count(b), b))

    # every statement inside objects ends in a semicolon
    stray = [ln for ln in src.split('\n')
             if ln.strip() and not ln.strip().endswith((';', '{', '(', '}', ');', '},', ',', '*/'))
             and not ln.strip().startswith(('//', '/*'))]
    ok('every setting is terminated', not stray, stray[:3])

    # An object is defined by a line that opens its dictionary. The main group
    # conventionally carries no trailing comment, so both forms count.
    defs = re.findall(r'^\t\t([0-9A-F]{24})(?: /\*[^*]*\*/)? = \{', src, re.M)
    defined = set(defs)
    referenced = set(re.findall(r'\b([0-9A-F]{24})\b', src)) - defined
    dangling = sorted(r for r in referenced if r not in defined)
    ok('every object id that is referenced is also defined', not dangling, dangling[:5])
    ok('object ids are unique', len(defs) == len(defined), '%d lines, %d ids' % (len(defs), len(defined)))
    ok('every object that is defined is also reachable',
       all(d in src.replace('\t\t' + d + ' ', '', 1) for d in defined
           if d != re.search(r'rootObject = ([0-9A-F]{24})', src).group(1)),
       'an object is defined but never referenced')

    root = re.search(r'rootObject = ([0-9A-F]{24})', src)
    ok('a root object is named and defined', root and root.group(1) in defined)

    for isa in ['PBXProject', 'PBXNativeTarget', 'PBXSourcesBuildPhase',
                'PBXResourcesBuildPhase', 'PBXFrameworksBuildPhase',
                'PBXShellScriptBuildPhase', 'XCConfigurationList', 'XCBuildConfiguration']:
        ok('there is a %s' % isa, ('isa = %s;' % isa) in src)

    ok('the target builds an application',
       'productType = "com.apple.product-type.application";' in src)
    ok('both configurations exist twice over',
       src.count('name = Debug;') == 2 and src.count('name = Release;') == 2)

    # every file the project compiles or bundles has to be on disk
    refs = re.findall(r'/\* ([^*]+) \*/ = \{isa = PBXFileReference;[^}]*path = ([^;]+);', src)
    missing = []
    for _, path in refs:
        path = path.strip().strip('"')
        if path.endswith('.app'):
            continue
        if not os.path.exists(os.path.join(IOS, 'Checksmith', path)):
            missing.append(path)
    ok('every referenced file is on disk', not missing, missing)

    ok('the Swift sources are compiled',
       src.count('in Sources */,') == 2, src.count('in Sources */,'))
    ok('the asset catalog and launch screen are bundled',
       src.count('in Resources */,') == 2)
    ok('the game page is copied in at build time',
       'index.html' in src and '$(SRCROOT)/../index.html' in src)
    ok('the game page exists to be copied',
       os.path.exists(os.path.join(ROOT, 'index.html')))

    info = os.path.join(IOS, 'Checksmith', 'Info.plist')
    plist = open(info).read()
    ok('Info.plist names the launch screen', 'UILaunchStoryboardName' in plist)
    ok('Info.plist takes its version from the build settings',
       '$(MARKETING_VERSION)' in plist and '$(CURRENT_PROJECT_VERSION)' in plist)
    ok('the app declares no encryption', 'ITSAppUsesNonExemptEncryption' in plist)

    scheme = os.path.join(IOS, 'Checksmith.xcodeproj', 'xcshareddata', 'xcschemes',
                          'Checksmith.xcscheme')
    ok('a shared scheme is checked in', os.path.exists(scheme))
    if os.path.exists(scheme):
        text = open(scheme).read()
        blueprints = set(re.findall(r'BlueprintIdentifier = "([0-9A-F]{24})"', text))
        target_id = re.search(
            r'([0-9A-F]{24}) /\* Checksmith \*/ = \{\s*isa = PBXNativeTarget;', src)
        ok('the scheme points at the real target',
           target_id and blueprints == {target_id.group(1)},
           '%s vs %s' % (sorted(blueprints), target_id and target_id.group(1)))

    iconset = os.path.join(IOS, 'Checksmith', 'Assets.xcassets', 'AppIcon.appiconset')
    import json
    contents = json.load(open(os.path.join(iconset, 'Contents.json')))
    gone = [i['filename'] for i in contents['images']
            if not os.path.exists(os.path.join(iconset, i['filename']))]
    ok('every icon the catalog lists is present', not gone, gone)
    ok('there is a 1024px marketing icon',
       any(i['size'] == '1024x1024' for i in contents['images']))

    print('\n' + ('FAILED: %d' % len(fails) if fails else 'All project checks passed')
          + ' (%d checks)' % passes[0])
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
