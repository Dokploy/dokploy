#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证所有 JSON 文件的格式和可解析性
"""
import json
import os
from pathlib import Path

def validate_json_file(file_path):
    """验证单个 JSON 文件"""
    errors = []
    warnings = []
    
    try:
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查文件是否为空
        if not content.strip():
            errors.append("文件为空")
            return errors, warnings
        
        # 尝试解析 JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            errors.append(f"JSON 解析错误: {e.msg} (行 {e.lineno}, 列 {e.colno})")
            return errors, warnings
        
        # 检查数据类型
        if not isinstance(data, dict):
            warnings.append(f"根元素不是对象，而是 {type(data).__name__}")
        
        # 检查是否有空键
        empty_keys = [k for k, v in data.items() if v == ""]
        if empty_keys:
            warnings.append(f"发现 {len(empty_keys)} 个空值键")
        
        # 检查键名格式（通常应该是字符串）
        invalid_keys = [k for k in data.keys() if not isinstance(k, str)]
        if invalid_keys:
            errors.append(f"发现非字符串键: {invalid_keys[:5]}")
        
        # 检查值类型（应该都是字符串）
        non_string_values = [(k, type(v).__name__) for k, v in data.items() if not isinstance(v, str)]
        if non_string_values:
            warnings.append(f"发现非字符串值: {len(non_string_values)} 个 (示例: {non_string_values[:3]})")
        
        return errors, warnings
        
    except UnicodeDecodeError as e:
        errors.append(f"编码错误: {e}")
        return errors, warnings
    except Exception as e:
        errors.append(f"未知错误: {type(e).__name__}: {e}")
        return errors, warnings

def main():
    """主函数：验证所有 JSON 文件"""
    # 获取脚本所在目录
    script_dir = Path(__file__).parent
    
    # 查找所有 JSON 文件
    json_files = sorted(list(script_dir.rglob('*.json')))
    
    print(f"找到 {len(json_files)} 个 JSON 文件")
    print("=" * 70)
    print()
    
    total_errors = 0
    total_warnings = 0
    files_with_errors = []
    files_with_warnings = []
    
    for json_file in json_files:
        # 跳过脚本文件本身
        if json_file.name in ['fix_indent.py', 'validate_json.py', 'translate_ko_to_kz.py']:
            continue
        
        rel_path = json_file.relative_to(script_dir)
        errors, warnings = validate_json_file(json_file)
        
        if errors or warnings:
            status = "⚠️"
            if errors:
                status = "❌"
                total_errors += len(errors)
                files_with_errors.append(rel_path)
            if warnings:
                total_warnings += len(warnings)
                files_with_warnings.append(rel_path)
            
            print(f"{status} {rel_path}")
            
            for error in errors:
                print(f"    ❌ 错误: {error}")
            
            for warning in warnings:
                print(f"    ⚠️  警告: {warning}")
            
            print()
        else:
            print(f"✓ {rel_path}")
    
    # 输出统计信息
    print("=" * 70)
    print(f"验证完成!")
    print(f"总文件数: {len(json_files)}")
    print(f"有错误的文件: {len(files_with_errors)}")
    print(f"有警告的文件: {len(files_with_warnings)}")
    print(f"总错误数: {total_errors}")
    print(f"总警告数: {total_warnings}")
    
    if files_with_errors:
        print("\n❌ 有错误的文件:")
        for file_path in files_with_errors:
            print(f"  - {file_path}")
    
    if files_with_warnings and not files_with_errors:
        print("\n⚠️  有警告的文件:")
        for file_path in files_with_warnings[:10]:  # 只显示前10个
            print(f"  - {file_path}")
        if len(files_with_warnings) > 10:
            print(f"  ... 还有 {len(files_with_warnings) - 10} 个文件有警告")

if __name__ == '__main__':
    main()

