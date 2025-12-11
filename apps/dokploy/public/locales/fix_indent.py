#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量修复所有 JSON 文件的缩进为 4 个空格
"""
import json
import os
from pathlib import Path

def fix_json_indent(file_path):
    """修复单个 JSON 文件的缩进为 4 个空格"""
    try:
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 解析 JSON 以验证格式
        data = json.loads(content)
        
        # 使用 4 个空格缩进重新格式化
        formatted_content = json.dumps(data, ensure_ascii=False, indent=4)
        
        # 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(formatted_content)
        
        return True, None
    except json.JSONDecodeError as e:
        return False, f"JSON 格式错误: {e}"
    except Exception as e:
        return False, f"处理错误: {e}"

def main():
    """主函数：遍历所有 JSON 文件并修复缩进"""
    # 获取脚本所在目录
    script_dir = Path(__file__).parent
    
    # 查找所有 JSON 文件
    json_files = list(script_dir.rglob('*.json'))
    
    print(f"找到 {len(json_files)} 个 JSON 文件")
    print("开始处理...\n")
    
    success_count = 0
    error_count = 0
    errors = []
    
    for json_file in json_files:
        # 跳过脚本文件本身（如果有）
        if json_file.name == 'fix_indent.py':
            continue
        
        print(f"处理: {json_file.relative_to(script_dir)}")
        success, error = fix_json_indent(json_file)
        
        if success:
            success_count += 1
            print(f"  ✓ 成功\n")
        else:
            error_count += 1
            errors.append((json_file.relative_to(script_dir), error))
            print(f"  ✗ 失败: {error}\n")
    
    # 输出统计信息
    print("=" * 50)
    print(f"处理完成!")
    print(f"成功: {success_count} 个文件")
    print(f"失败: {error_count} 个文件")
    
    if errors:
        print("\n失败的文件:")
        for file_path, error in errors:
            print(f"  - {file_path}: {error}")

if __name__ == '__main__':
    main()

