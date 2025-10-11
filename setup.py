from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="crypto-ia",
    version="0.1.0",
    author="[Votre nom]",
    author_email="[Votre email]",
    description="Système de trading crypto intelligent avec agents IA",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/[votre-username]/crypto-ia",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.11",
)
