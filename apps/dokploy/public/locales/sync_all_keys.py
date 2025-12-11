#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动补齐所有语言文件中缺失的键（以英文值占位）
从 en/common.json 读取所有键，然后为其他语言文件补齐缺失的键
"""

import json
from pathlib import Path


def load_json(path: Path) -> dict:
    """加载 JSON 文件"""
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, data: dict) -> None:
    """保存 JSON 文件（保持原有格式）"""
    # 读取原始文件以保持缩进格式
    with path.open("r", encoding="utf-8") as f:
        original_content = f.read()
    
    # 检测缩进（tab 或空格）
    indent = "\t" if "\t" in original_content[:100] else "    "
    
    # 格式化并保存
    formatted = json.dumps(data, ensure_ascii=False, indent=4)
    # 如果原文件使用 tab，转换为 tab
    if indent == "\t":
        lines = formatted.split("\n")
        formatted = "\n".join(
            line.replace("    ", "\t", line.count("    ") // 4) if line.strip() else line
            for line in lines
        )
    
    with path.open("w", encoding="utf-8") as f:
        f.write(formatted + "\n")


def main():
    """主函数：补齐所有缺失的键"""
    base_dir = Path(__file__).parent
    
    # 读取英文文件作为参考
    en_path = base_dir / "en" / "common.json"
    if not en_path.exists():
        raise FileNotFoundError(f"Missing en/common.json at {en_path}")
    
    en_data = load_json(en_path)
    print(f"英文文件共有 {len(en_data)} 个键\n")
    print("=" * 70)
    
    # 遍历所有语言目录
    total_added = 0
    for lang_dir in sorted(p for p in base_dir.iterdir() if p.is_dir()):
        lang_code = lang_dir.name
        
        # 跳过英文和隐藏目录
        if lang_code == "en" or lang_code.startswith("."):
            continue
        
        common_path = lang_dir / "common.json"
        if not common_path.exists():
            print(f"⚠️  {lang_code}: common.json not found, skip")
            continue
        
        # 加载语言文件
        lang_data = load_json(common_path)
        
        # 找出缺失的键
        missing_keys = {k: en_data[k] for k in en_data if k not in lang_data}
        
        if missing_keys:
            # 添加缺失的键
            lang_data.update(missing_keys)
            dump_json(common_path, lang_data)
            print(f"✓ {lang_code}: 添加了 {len(missing_keys)} 个键")
            total_added += len(missing_keys)
        else:
            print(f"✓ {lang_code}: 无需添加（键已完整）")
    
    print("\n" + "=" * 70)
    print(f"完成！总共添加了 {total_added} 个键")


if __name__ == "__main__":
    main()

