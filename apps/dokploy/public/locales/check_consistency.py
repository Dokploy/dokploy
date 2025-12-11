#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查所有 JSON 文件的键一致性和其他潜在问题
"""
import json
from pathlib import Path
from collections import defaultdict

def get_keys(file_path):
    """获取 JSON 文件的所有键"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return set(data.keys())
    except Exception as e:
        return None

def main():
    """主函数：检查键一致性"""
    script_dir = Path(__file__).parent
    
    # 获取所有语言目录
    lang_dirs = [d for d in script_dir.iterdir() if d.is_dir() and not d.name.startswith('.')]
    
    # 按文件类型分组
    file_types = ['common.json', 'settings.json']
    
    issues = []
    
    for file_type in file_types:
        print(f"\n检查 {file_type} 文件...")
        print("=" * 70)
        
        # 收集所有文件的键
        all_keys_by_file = {}
        all_keys_set = set()
        
        for lang_dir in sorted(lang_dirs):
            file_path = lang_dir / file_type
            if file_path.exists():
                keys = get_keys(file_path)
                if keys is not None:
                    all_keys_by_file[lang_dir.name] = keys
                    all_keys_set.update(keys)
        
        if not all_keys_by_file:
            print(f"  未找到 {file_type} 文件")
            continue
        
        # 检查每个文件是否缺少键
        reference_keys = None
        for lang, keys in all_keys_by_file.items():
            if reference_keys is None:
                reference_keys = keys
                reference_lang = lang
            else:
                missing = reference_keys - keys
                extra = keys - reference_keys
                if missing:
                    issues.append(f"{lang}/{file_type}: 缺少 {len(missing)} 个键 (参考: {reference_lang})")
                    print(f"  ⚠️  {lang}: 缺少 {len(missing)} 个键")
                    if len(missing) <= 5:
                        for key in sorted(missing):
                            print(f"      - {key}")
                    else:
                        for key in sorted(list(missing)[:5]):
                            print(f"      - {key}")
                        print(f"      ... 还有 {len(missing) - 5} 个")
                
                if extra:
                    issues.append(f"{lang}/{file_type}: 多出 {len(extra)} 个键 (参考: {reference_lang})")
                    print(f"  ⚠️  {lang}: 多出 {len(extra)} 个键")
                    if len(extra) <= 5:
                        for key in sorted(extra):
                            print(f"      - {key}")
                    else:
                        for key in sorted(list(extra)[:5]):
                            print(f"      - {key}")
                        print(f"      ... 还有 {len(extra) - 5} 个")
        
        # 统计信息
        print(f"\n  {file_type} 统计:")
        print(f"    总文件数: {len(all_keys_by_file)}")
        print(f"    总键数: {len(all_keys_set)}")
        if reference_keys:
            print(f"    参考文件 ({reference_lang}): {len(reference_keys)} 个键")
    
    # 检查文件大小异常
    print(f"\n检查文件大小...")
    print("=" * 70)
    
    for file_type in file_types:
        sizes = []
        for lang_dir in sorted(lang_dirs):
            file_path = lang_dir / file_type
            if file_path.exists():
                size = file_path.stat().st_size
                sizes.append((lang_dir.name, size))
        
        if sizes:
            sizes.sort(key=lambda x: x[1])
            avg_size = sum(s for _, s in sizes) / len(sizes)
            
            # 检查异常大小的文件（超过平均值50%或小于平均值50%）
            for lang, size in sizes:
                if size > avg_size * 1.5 or size < avg_size * 0.5:
                    print(f"  ⚠️  {lang}/{file_type}: {size:,} 字节 (平均: {avg_size:,.0f})")
    
    # 总结
    print(f"\n" + "=" * 70)
    if issues:
        print(f"发现 {len(issues)} 个潜在问题")
    else:
        print("✓ 所有文件键一致性检查通过！")

if __name__ == '__main__':
    main()

